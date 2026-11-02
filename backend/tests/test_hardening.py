"""Regression tests for the bugs found when testing against the real frontend crypto."""
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient, ASGITransport

from app.db import init_db, AsyncSessionLocal
from app.main import app
from app.models import Vault
from app.sweeper import sweep_expired_vaults

AUTH = "correct-auth-token-0123456789abcdef"
KDF = {"algorithm": "PBKDF2-SHA256", "iterations": 600000, "salt": "c2FsdHNhbHRzYWx0"}


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    yield


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def local(url: str) -> str:
    """Turn an absolute local-storage URL into a path for the test client."""
    return url.split("http://localhost:4000")[-1]


async def make_vault(c, *, size=64, max_downloads=1, passkey=False):
    body = {"sizeBytes": size, "expiry": "1h", "maxDownloads": max_downloads, "encryptedMeta": "meta"}
    if passkey:
        body["passkeyProtection"] = {"authToken": AUTH, "kdf": KDF}
    created = (await c.post("/api/uploads", json=body)).json()
    put = await c.put(local(created["uploadUrl"]), content=b"x" * size)
    assert put.status_code == 200
    assert (await c.post(f"/api/uploads/{created['uploadId']}/complete")).status_code == 200
    return created


async def access_token(c, token, auth=None):
    res = await c.post(f"/api/vault/{token}/unlock", json={"authToken": auth} if auth else {})
    assert res.status_code == 200, res.text
    return res.json()["accessToken"]


# ─── 1. The last allowed download must still be fetchable ─────────────────────

async def test_last_download_url_still_works():
    async with client() as c:
        v = await make_vault(c, max_downloads=1)
        at = await access_token(c, v["shareToken"])
        dl = await c.post(f"/api/vault/{v['shareToken']}/download", headers={"Authorization": f"Bearer {at}"})
        assert dl.status_code == 200
        assert dl.json()["downloadsRemaining"] == 0

        blob = await c.get(local(dl.json()["downloadUrl"]))
        assert blob.status_code == 200
        assert blob.content == b"x" * 64

        # Access is still refused straight away
        status = await c.get(f"/api/vault/{v['shareToken']}")
        assert status.json()["error"]["code"] == "EXHAUSTED"


async def test_exhausted_vault_purged_only_after_grace():
    async with client() as c:
        v = await make_vault(c, max_downloads=1)
        at = await access_token(c, v["shareToken"])
        await c.post(f"/api/vault/{v['shareToken']}/download", headers={"Authorization": f"Bearer {at}"})

        await sweep_expired_vaults()
        async with AsyncSessionLocal() as s:
            assert await s.get(Vault, v["uploadId"]) is not None  # still inside grace period
            row = await s.get(Vault, v["uploadId"])
            row.exhausted_at = datetime.now(timezone.utc) - timedelta(minutes=10)
            await s.commit()

        await sweep_expired_vaults()
        async with AsyncSessionLocal() as s:
            assert await s.get(Vault, v["uploadId"]) is None


# ─── 2. Races: passkey attempts and download counts ───────────────────────────

async def test_parallel_wrong_passkeys_cannot_exceed_limit():
    async with client() as c:
        v = await make_vault(c, passkey=True)
        url = f"/api/vault/{v['shareToken']}/unlock"
        results = await asyncio.gather(
            *[c.post(url, json={"authToken": f"wrong-guess-{i:04d}-padding"}) for i in range(12)]
        )
        codes = [r.json()["error"]["code"] for r in results]
        assert codes.count("WRONG_PASSKEY") <= 4
        assert "LOCKED_OUT" in codes

        # Even the right passkey is refused now
        right = await c.post(url, json={"authToken": AUTH})
        assert right.json()["error"]["code"] == "LOCKED_OUT"


async def test_correct_passkey_does_not_use_up_an_attempt():
    async with client() as c:
        v = await make_vault(c, passkey=True)
        url = f"/api/vault/{v['shareToken']}/unlock"
        await c.post(url, json={"authToken": "wrong-guess-0000-padding"})
        assert (await c.post(url, json={"authToken": AUTH})).status_code == 200
        wrong = await c.post(url, json={"authToken": "wrong-guess-0001-padding"})
        assert wrong.json()["error"]["details"]["attemptsRemaining"] == 3


async def test_parallel_downloads_cannot_exceed_limit():
    async with client() as c:
        v = await make_vault(c, max_downloads=3)
        at = await access_token(c, v["shareToken"])
        results = await asyncio.gather(
            *[
                c.post(f"/api/vault/{v['shareToken']}/download", headers={"Authorization": f"Bearer {at}"})
                for _ in range(10)
            ]
        )
        assert sum(r.status_code == 200 for r in results) == 3
        assert all(r.json()["error"]["code"] == "EXHAUSTED" for r in results if r.status_code != 200)


# ─── 3. Error format matches shared/types.ts ──────────────────────────────────

async def test_validation_errors_use_api_error_shape():
    async with client() as c:
        res = await c.post(
            "/api/uploads", json={"sizeBytes": 10, "expiry": "2h", "maxDownloads": 1, "encryptedMeta": "x"}
        )
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"
        assert "expiry" in res.json()["error"]["details"]["fields"]

        missing = await c.get("/api/does-not-exist")
        assert missing.status_code == 404
        assert missing.json()["error"]["code"] == "NOT_FOUND"


# ─── 4. Local storage can't be abused ─────────────────────────────────────────

async def test_local_storage_rejects_traversal_and_unsigned_requests():
    async with client() as c:
        assert (await c.get("/api/storage/..%2Fephemera.db")).status_code == 404
        assert (await c.get("/api/storage/vaults/..%2F..%2Fapp%2Fmain.py")).status_code == 404

        v = await make_vault(c, max_downloads=3)
        at = await access_token(c, v["shareToken"])
        dl = await c.post(f"/api/vault/{v['shareToken']}/download", headers={"Authorization": f"Bearer {at}"})
        get_url = local(dl.json()["downloadUrl"])

        unsigned = get_url.split("?")[0]
        assert (await c.get(unsigned)).status_code == 403
        # A download link can't be used to overwrite the file
        assert (await c.put(get_url, content=b"evil")).status_code == 403
        assert (await c.get(get_url)).content == b"x" * 64


# ─── 5. Cron + abandoned uploads ──────────────────────────────────────────────

async def test_cron_accepts_vercel_get_and_rejects_bad_secret():
    async with client() as c:
        ok = await c.get("/api/cron/sweep", headers={"Authorization": "Bearer ephemera-cron-secret"})
        assert ok.status_code == 200
        bad = await c.get("/api/cron/sweep", headers={"Authorization": "Bearer nope"})
        assert bad.status_code == 401


async def test_abandoned_uploads_are_swept():
    async with AsyncSessionLocal() as s:
        s.add(
            Vault(
                upload_id="abandoned_upload_1",
                share_token="abandoned_token_1",
                size_bytes=10,
                expiry="1h",
                max_downloads=1,
                downloads_remaining=1,
                encrypted_meta="meta",
                storage_key="vaults/abandoned_upload_1",
                created_at=datetime.now(timezone.utc) - timedelta(hours=2),
            )
        )
        await s.commit()
    await sweep_expired_vaults()
    async with AsyncSessionLocal() as s:
        assert await s.get(Vault, "abandoned_upload_1") is None
