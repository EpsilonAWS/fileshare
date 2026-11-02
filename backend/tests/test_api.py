import pytest
import os
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone, timedelta
from app.main import app
from app.db import init_db, AsyncSessionLocal
from app.models import Vault
from app.schemas import MAX_CIPHERTEXT_BYTES


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    yield


@pytest.mark.asyncio
async def test_full_upload_and_download_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create upload
        create_res = await client.post(
            "/api/uploads",
            json={
                "sizeBytes": 1024,
                "expiry": "10m",
                "maxDownloads": 3,
                "encryptedMeta": "base64meta_example",
            },
        )
        assert create_res.status_code == 200, create_res.text
        data = create_res.json()
        upload_id = data["uploadId"]
        share_token = data["shareToken"]
        upload_url = data["uploadUrl"]

        # 2. Upload ciphertext to local storage endpoint
        # upload_url may be http://localhost:4000/api/storage/...
        storage_path = upload_url.split("http://localhost:4000")[-1]
        put_res = await client.put(storage_path, content=b"A" * 1024)
        assert put_res.status_code == 200

        # 3. Complete upload
        comp_res = await client.post(f"/api/uploads/{upload_id}/complete")
        assert comp_res.status_code == 200
        comp_data = comp_res.json()
        assert comp_data["shareToken"] == share_token
        assert comp_data["maxDownloads"] == 3

        # 4. Check vault status
        status_res = await client.get(f"/api/vault/{share_token}")
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["requiresPasskey"] is False

        # 5. Unlock (no passkey needed)
        unlock_res = await client.post(f"/api/vault/{share_token}/unlock", json={})
        assert unlock_res.status_code == 200
        unlock_data = unlock_res.json()
        access_token = unlock_data["accessToken"]
        assert unlock_data["meta"]["downloadsRemaining"] == 3

        # 6. Download 1
        dl_res = await client.post(
            f"/api/vault/{share_token}/download",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert dl_res.status_code == 200
        dl_data = dl_res.json()
        assert dl_data["downloadsRemaining"] == 2


@pytest.mark.asyncio
async def test_passkey_protection_and_lockout():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create upload with passkey
        create_res = await client.post(
            "/api/uploads",
            json={
                "sizeBytes": 512,
                "expiry": "1h",
                "maxDownloads": 1,
                "encryptedMeta": "meta_passkey",
                "passkeyProtection": {
                    "authToken": "correct-auth-token-123456",
                    "kdf": {
                        "algorithm": "PBKDF2-SHA256",
                        "iterations": 600000,
                        "salt": "randomsalt123",
                    },
                },
            },
        )
        assert create_res.status_code == 200
        data = create_res.json()
        upload_id = data["uploadId"]
        share_token = data["shareToken"]
        storage_path = data["uploadUrl"].split("http://localhost:4000")[-1]

        await client.put(storage_path, content=b"B" * 512)
        await client.post(f"/api/uploads/{upload_id}/complete")

        # Vault status requires passkey
        status_res = await client.get(f"/api/vault/{share_token}")
        assert status_res.status_code == 200
        assert status_res.json()["requiresPasskey"] is True
        assert status_res.json()["kdf"]["salt"] == "randomsalt123"

        # Unlock without passkey fails
        u1 = await client.post(f"/api/vault/{share_token}/unlock", json={})
        assert u1.status_code == 401
        assert u1.json()["error"]["code"] == "PASSKEY_REQUIRED"

        # 4 wrong passkey attempts
        for attempt in range(4):
            wrong_res = await client.post(
                f"/api/vault/{share_token}/unlock",
                json={"authToken": f"wrong-passkey-{attempt}"},
            )
            assert wrong_res.status_code == 401
            assert wrong_res.json()["error"]["code"] == "WRONG_PASSKEY"
            expected_remaining = 4 - attempt
            assert wrong_res.json()["error"]["details"]["attemptsRemaining"] == expected_remaining

        # 5th wrong attempt triggers lockout
        lock_res = await client.post(
            f"/api/vault/{share_token}/unlock",
            json={"authToken": "wrong-passkey-final"},
        )
        assert lock_res.status_code == 423
        assert lock_res.json()["error"]["code"] == "LOCKED_OUT"

        # Subsequent status also returns LOCKED_OUT
        stat2 = await client.get(f"/api/vault/{share_token}")
        assert stat2.status_code == 423
        assert stat2.json()["error"]["code"] == "LOCKED_OUT"


@pytest.mark.asyncio
async def test_exhaustion_invalidation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create upload with 1 max download
        create_res = await client.post(
            "/api/uploads",
            json={
                "sizeBytes": 256,
                "expiry": "10m",
                "maxDownloads": 1,
                "encryptedMeta": "single_download_meta",
            },
        )
        data = create_res.json()
        upload_id = data["uploadId"]
        share_token = data["shareToken"]
        storage_path = data["uploadUrl"].split("http://localhost:4000")[-1]

        await client.put(storage_path, content=b"C" * 256)
        await client.post(f"/api/uploads/{upload_id}/complete")

        # Unlock
        unlock_res = await client.post(f"/api/vault/{share_token}/unlock", json={})
        access_token = unlock_res.json()["accessToken"]

        # Download once (reaches 0 remaining)
        dl1 = await client.post(
            f"/api/vault/{share_token}/download",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert dl1.status_code == 200
        assert dl1.json()["downloadsRemaining"] == 0

        # Attempt download again -> 410 EXHAUSTED
        dl2 = await client.post(
            f"/api/vault/{share_token}/download",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert dl2.status_code == 410
        assert dl2.json()["error"]["code"] == "EXHAUSTED"

        # Vault status now returns EXHAUSTED
        stat = await client.get(f"/api/vault/{share_token}")
        assert stat.status_code == 410
        assert stat.json()["error"]["code"] == "EXHAUSTED"


@pytest.mark.asyncio
async def test_cron_sweeper():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create an expired vault directly in DB
        async with AsyncSessionLocal() as session:
            v = Vault(
                upload_id="test_expired_id",
                share_token="test_expired_token",
                size_bytes=100,
                expiry="10m",
                max_downloads=1,
                downloads_remaining=1,
                encrypted_meta="meta",
                storage_key="vaults/test_expired_id",
                completed_at=datetime.now(timezone.utc) - timedelta(hours=2),
                expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            )
            session.add(v)
            await session.commit()

        # Trigger cron sweeper
        cron_res = await client.post(
            "/api/cron/sweep",
            headers={"Authorization": "Bearer ephemera-cron-secret"},
        )
        assert cron_res.status_code == 200
        assert cron_res.json()["deleted"] >= 1


@pytest.mark.asyncio
async def test_edge_cases_and_error_codes():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. FILE_TOO_LARGE
        too_large = await client.post(
            "/api/uploads",
            json={
                "sizeBytes": MAX_CIPHERTEXT_BYTES + 100,
                "expiry": "10m",
                "maxDownloads": 1,
                "encryptedMeta": "large_meta",
            },
        )
        assert too_large.status_code == 413
        assert too_large.json()["error"]["code"] == "FILE_TOO_LARGE"

        # 2. NOT_FOUND on unknown complete
        unknown_comp = await client.post("/api/uploads/non-existent-upload-id/complete")
        assert unknown_comp.status_code == 404
        assert unknown_comp.json()["error"]["code"] == "NOT_FOUND"

        # 3. NOT_FOUND on unknown vault token
        unknown_vault = await client.get("/api/vault/non-existent-share-token")
        assert unknown_vault.status_code == 404
        assert unknown_vault.json()["error"]["code"] == "NOT_FOUND"

        # 4. ACCESS_TOKEN_INVALID on invalid token or mismatched token
        bad_token = await client.post(
            "/api/vault/some-token/download",
            headers={"Authorization": "Bearer bad.token.value"},
        )
        assert bad_token.status_code == 401
        assert bad_token.json()["error"]["code"] == "ACCESS_TOKEN_INVALID"

        # 5. Unauthorized cron invocation
        bad_cron = await client.post(
            "/api/cron/sweep",
            headers={"Authorization": "Bearer wrong-secret"},
        )
        assert bad_cron.status_code == 400
        assert bad_cron.json()["error"]["code"] == "VALIDATION_ERROR"
