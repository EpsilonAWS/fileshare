import os
import secrets
import base64
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional
from contextlib import asynccontextmanager

import hmac

from fastapi import FastAPI, Depends, Request, Header, status
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, case

from app.config import STORAGE_MODE, CRON_SECRET, CORS_ORIGINS, ON_VERCEL, STORAGE_GRACE_SECONDS
from app.db import init_db, get_db
from app.models import Vault
from app.schemas import (
    EXPIRY_SECONDS,
    MAX_CIPHERTEXT_BYTES,
    MAX_PASSKEY_ATTEMPTS,
    UPLOAD_URL_TTL_SECONDS,
    DOWNLOAD_URL_TTL_SECONDS,
    ACCESS_TOKEN_TTL_SECONDS,
    CreateUploadRequest,
    CreateUploadResponse,
    CompleteUploadResponse,
    VaultStatusResponse,
    UnlockRequest,
    UnlockResponse,
    VaultMetadata,
    DownloadResponse,
    KdfParams,
)
from app.security import hash_auth_token, verify_auth_token, create_access_token, verify_access_token
from app.storage import (
    generate_presigned_put,
    generate_presigned_get,
    verify_object_exists,
    delete_object,
    local_path,
    verify_local_signature,
)
from app.sweeper import sweep_expired_vaults, run_periodic_sweeper

ERROR_STATUS = {
    "VALIDATION_ERROR": 400,
    "PASSKEY_REQUIRED": 401,
    "WRONG_PASSKEY": 401,
    "ACCESS_TOKEN_INVALID": 401,
    "NOT_FOUND": 404,
    "UPLOAD_INCOMPLETE": 409,
    "EXPIRED": 410,
    "EXHAUSTED": 410,
    "FILE_TOO_LARGE": 413,
    "LOCKED_OUT": 423,
    "RATE_LIMITED": 429,
    "STORAGE_ERROR": 502,
    "INTERNAL": 500,
}


def api_error(code: str, message: str, details: Optional[dict] = None) -> JSONResponse:
    status_code = ERROR_STATUS.get(code, 400)
    payload = {"error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=payload)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def b64url_random(bytes_count: int = 16) -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(bytes_count)).decode().rstrip("=")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    await init_db()
    # In continuous server/container mode, launch the background sweeper.
    # On Vercel there is no long-running process — Vercel Cron calls /api/cron/sweep instead.
    sweeper_task = None if ON_VERCEL else asyncio.create_task(run_periodic_sweeper(interval_seconds=60))
    yield
    if sweeper_task:
        sweeper_task.cancel()
        try:
            await sweeper_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Ephemera Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,  # no cookies are used; tokens travel in headers
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# Every error leaves the API in the shared/types.ts ApiError shape: { error: { code, message, details? } }
@app.exception_handler(RequestValidationError)
async def on_validation_error(request: Request, exc: RequestValidationError):
    fields = {
        ".".join(str(p) for p in err.get("loc", []) if p != "body") or "body": err.get("msg", "invalid")
        for err in exc.errors()
    }
    return api_error("VALIDATION_ERROR", "Invalid request", details={"fields": fields})


@app.exception_handler(StarletteHTTPException)
async def on_http_error(request: Request, exc: StarletteHTTPException):
    code = "NOT_FOUND" if exc.status_code == 404 else ("INTERNAL" if exc.status_code >= 500 else "VALIDATION_ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": code, "message": str(exc.detail)}},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def on_unexpected_error(request: Request, exc: Exception):
    return api_error("INTERNAL", "Something went wrong")


def past_grace(ts: Optional[datetime], now: datetime) -> bool:
    """True once a deadline is far enough behind us that in-flight downloads have finished."""
    return ts is not None and ts <= now - timedelta(seconds=STORAGE_GRACE_SECONDS)


# ─── 1. Create upload ────────────────────────────────────────────────────────
@app.post("/api/uploads", response_model=CreateUploadResponse)
async def create_upload(req: CreateUploadRequest, db: AsyncSession = Depends(get_db)):
    if req.sizeBytes > MAX_CIPHERTEXT_BYTES:
        return api_error("FILE_TOO_LARGE", "File size exceeds the 100 MB limit")
    if not req.encryptedMeta:
        return api_error("VALIDATION_ERROR", "encryptedMeta is required")

    upload_id = b64url_random(16)
    share_token = b64url_random(24)
    storage_key = f"vaults/{upload_id}"

    auth_hash = None
    kdf_salt = None
    kdf_iter = None
    kdf_algo = None

    if req.passkeyProtection:
        auth_hash = hash_auth_token(req.passkeyProtection.authToken)
        kdf_salt = req.passkeyProtection.kdf.salt
        kdf_iter = req.passkeyProtection.kdf.iterations
        kdf_algo = req.passkeyProtection.kdf.algorithm

    vault = Vault(
        upload_id=upload_id,
        share_token=share_token,
        size_bytes=req.sizeBytes,
        expiry=req.expiry,
        max_downloads=req.maxDownloads,
        downloads_remaining=req.maxDownloads,
        encrypted_meta=req.encryptedMeta,
        auth_token_hash=auth_hash,
        kdf_salt=kdf_salt,
        kdf_iterations=kdf_iter,
        kdf_algorithm=kdf_algo,
        storage_key=storage_key,
        failed_attempts=0,
    )
    db.add(vault)
    await db.commit()

    upload_url, upload_headers = generate_presigned_put(storage_key, expires_in=UPLOAD_URL_TTL_SECONDS)
    expires_at = (utc_now() + timedelta(seconds=UPLOAD_URL_TTL_SECONDS)).isoformat()

    return CreateUploadResponse(
        uploadId=upload_id,
        shareToken=share_token,
        uploadUrl=upload_url,
        uploadHeaders=upload_headers,
        uploadUrlExpiresAt=expires_at,
    )


# ─── 2. Complete upload ──────────────────────────────────────────────────────
@app.post("/api/uploads/{upload_id}/complete", response_model=CompleteUploadResponse)
async def complete_upload(upload_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Vault).where(Vault.upload_id == upload_id)
    result = await db.execute(stmt)
    vault = result.scalar_one_or_none()

    if not vault:
        return api_error("NOT_FOUND", "Unknown upload")

    if vault.completed_at is not None:
        expires_at = ensure_utc(vault.expires_at)
        return CompleteUploadResponse(
            shareToken=vault.share_token,
            expiresAt=expires_at.isoformat() if expires_at else "",
            maxDownloads=vault.max_downloads,
            serverTime=iso_now(),
        )

    # Verify object uploaded to storage
    if not verify_object_exists(vault.storage_key, expected_size=vault.size_bytes):
        return api_error("UPLOAD_INCOMPLETE", "Storage object verification failed or incomplete")

    completed = utc_now()
    duration = EXPIRY_SECONDS.get(vault.expiry, 600)
    expires = completed + timedelta(seconds=duration)

    vault.completed_at = completed
    vault.expires_at = expires
    await db.commit()

    return CompleteUploadResponse(
        shareToken=vault.share_token,
        expiresAt=expires.isoformat(),
        maxDownloads=vault.max_downloads,
        serverTime=iso_now(),
    )


# Helper: Check vault status and invalidate immediately if expired/exhausted
async def get_and_check_vault(token: str, db: AsyncSession):
    stmt = select(Vault).where(Vault.share_token == token)
    result = await db.execute(stmt)
    vault = result.scalar_one_or_none()

    if not vault:
        return None, api_error("NOT_FOUND", "This link does not exist")
    if not vault.completed_at:
        return None, api_error("UPLOAD_INCOMPLETE", "Upload not finished")

    now = utc_now()
    expires_at = ensure_utc(vault.expires_at)
    if expires_at and expires_at <= now:
        # Access is refused immediately; the object itself is purged once any
        # download URL issued just before expiry has had time to finish.
        if past_grace(expires_at, now):
            delete_object(vault.storage_key)
        return None, api_error("EXPIRED", "This file has expired")

    if vault.downloads_remaining <= 0:
        if past_grace(ensure_utc(vault.exhausted_at), now) or vault.exhausted_at is None:
            delete_object(vault.storage_key)
        return None, api_error("EXHAUSTED", "No downloads remaining")

    if vault.failed_attempts >= MAX_PASSKEY_ATTEMPTS:
        return None, api_error("LOCKED_OUT", "Too many wrong attempts", details={"retryAfterSeconds": 0})

    return vault, None


# ─── 3. Vault status ─────────────────────────────────────────────────────────
@app.get("/api/vault/{token}", response_model=VaultStatusResponse)
async def get_vault_status(token: str, db: AsyncSession = Depends(get_db)):
    vault, err = await get_and_check_vault(token, db)
    if err:
        return err

    kdf = None
    if vault.kdf_salt and vault.kdf_iterations:
        kdf = KdfParams(
            algorithm=vault.kdf_algorithm or "PBKDF2-SHA256",
            iterations=vault.kdf_iterations,
            salt=vault.kdf_salt,
        )

    return VaultStatusResponse(
        requiresPasskey=bool(vault.auth_token_hash),
        kdf=kdf,
        serverTime=iso_now(),
    )


# ─── 4. Unlock ───────────────────────────────────────────────────────────────
@app.post("/api/vault/{token}/unlock", response_model=UnlockResponse)
async def unlock_vault(token: str, req: UnlockRequest, db: AsyncSession = Depends(get_db)):
    vault, err = await get_and_check_vault(token, db)
    if err:
        return err

    if vault.auth_token_hash:
        if not req.authToken:
            return api_error("PASSKEY_REQUIRED", "Passkey required")

        # Reserve an attempt atomically BEFORE the (slow) Argon2 check, so parallel
        # guesses can't all slip in while the counter still reads 0.
        reserved = await db.execute(
            update(Vault)
            .where(Vault.share_token == token, Vault.failed_attempts < MAX_PASSKEY_ATTEMPTS)
            .values(failed_attempts=Vault.failed_attempts + 1)
            .returning(Vault.failed_attempts)
            .execution_options(synchronize_session=False)
        )
        row = reserved.first()
        await db.commit()
        if row is None:
            return api_error("LOCKED_OUT", "Too many wrong attempts", details={"retryAfterSeconds": 0})
        attempts_used = row[0]

        # Argon2 is CPU-bound: keep it off the event loop.
        ok = await run_in_threadpool(verify_auth_token, vault.auth_token_hash, req.authToken)
        if ok:
            # Correct passkey: give the reserved attempt back.
            await db.execute(
                update(Vault)
                .where(Vault.share_token == token)
                .values(failed_attempts=Vault.failed_attempts - 1)
                .execution_options(synchronize_session=False)
            )
            await db.commit()
        else:
            left = MAX_PASSKEY_ATTEMPTS - attempts_used
            if left <= 0:
                return api_error("LOCKED_OUT", "Too many wrong attempts", details={"retryAfterSeconds": 0})
            return api_error("WRONG_PASSKEY", "Wrong passkey", details={"attemptsRemaining": left})

    access_token, expires_at_iso = create_access_token(token, ttl_seconds=ACCESS_TOKEN_TTL_SECONDS)

    expires_at = ensure_utc(vault.expires_at)
    meta = VaultMetadata(
        encryptedMeta=vault.encrypted_meta,
        sizeBytes=vault.size_bytes,
        expiresAt=expires_at.isoformat() if expires_at else "",
        downloadsRemaining=vault.downloads_remaining,
        maxDownloads=vault.max_downloads,
        serverTime=iso_now(),
    )

    return UnlockResponse(
        accessToken=access_token,
        accessTokenExpiresAt=expires_at_iso,
        meta=meta,
    )


# ─── 5. Download ─────────────────────────────────────────────────────────────
@app.post("/api/vault/{token}/download", response_model=DownloadResponse)
async def download_vault(
    token: str,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        return api_error("ACCESS_TOKEN_INVALID", "Unlock again")

    bearer = authorization[len("Bearer ") :].strip()
    if not verify_access_token(bearer, token):
        return api_error("ACCESS_TOKEN_INVALID", "Unlock again")

    # One conditional UPDATE: only succeeds while the vault is live and has downloads
    # left, so parallel requests can never take more downloads than allowed.
    now = utc_now()
    result = await db.execute(
        update(Vault)
        .where(
            Vault.share_token == token,
            Vault.completed_at.is_not(None),
            Vault.expires_at > now,
            Vault.downloads_remaining > 0,
            Vault.failed_attempts < MAX_PASSKEY_ATTEMPTS,
        )
        .values(
            downloads_remaining=Vault.downloads_remaining - 1,
            # Remember when the last download URL went out; the sweeper purges the
            # object after a grace period instead of deleting it under the downloader.
            exhausted_at=case((Vault.downloads_remaining <= 1, now), else_=Vault.exhausted_at),
        )
        .returning(Vault.downloads_remaining, Vault.storage_key)
        .execution_options(synchronize_session=False)
    )
    row = result.first()
    await db.commit()

    if row is None:
        _, err = await get_and_check_vault(token, db)
        return err or api_error("EXHAUSTED", "No downloads remaining")

    remaining, storage_key = row
    download_url = generate_presigned_get(storage_key, expires_in=DOWNLOAD_URL_TTL_SECONDS)
    download_url_expires_at = (now + timedelta(seconds=DOWNLOAD_URL_TTL_SECONDS)).isoformat()

    return DownloadResponse(
        downloadUrl=download_url,
        downloadUrlExpiresAt=download_url_expires_at,
        downloadsRemaining=remaining,
    )


# ─── 6. Background Sweeper / Vercel Cron Trigger ─────────────────────────────
# Vercel Cron sends GET with "Authorization: Bearer $CRON_SECRET"; POST kept for manual runs.
@app.api_route("/api/cron/sweep", methods=["GET", "POST"])
async def trigger_sweeper(authorization: Optional[str] = Header(None)):
    if CRON_SECRET:
        token = authorization[len("Bearer ") :] if authorization and authorization.startswith("Bearer ") else ""
        if not hmac.compare_digest(token.encode(), CRON_SECRET.encode()):
            return JSONResponse(
                status_code=401,
                content={"error": {"code": "ACCESS_TOKEN_INVALID", "message": "Unauthorized cron invocation"}},
            )

    deleted = await sweep_expired_vaults()
    return {"status": "ok", "deleted": deleted, "serverTime": iso_now()}


# ─── Local Storage Fallback Handlers ─────────────────────────────────────────
# Dev only. URLs are HMAC-signed and expire, like presigned S3 URLs, so a download
# link can't be turned into an upload link and keys can't escape the storage folder.
if STORAGE_MODE == "local":
    @app.put("/api/storage/{storage_key:path}")
    async def local_storage_put(
        storage_key: str, request: Request, exp: Optional[str] = None, sig: Optional[str] = None
    ):
        target = local_path(storage_key)
        if target is None:
            return Response(status_code=status.HTTP_404_NOT_FOUND)
        if not verify_local_signature("put", storage_key, exp, sig):
            return Response(status_code=status.HTTP_403_FORBIDDEN)

        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_CIPHERTEXT_BYTES:
                return Response(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(bytes(body))
        return Response(status_code=status.HTTP_200_OK)

    @app.get("/api/storage/{storage_key:path}")
    async def local_storage_get(storage_key: str, exp: Optional[str] = None, sig: Optional[str] = None):
        target = local_path(storage_key)
        if target is None or not target.is_file():
            return Response(status_code=status.HTTP_404_NOT_FOUND)
        if not verify_local_signature("get", storage_key, exp, sig):
            return Response(status_code=status.HTTP_403_FORBIDDEN)
        return FileResponse(path=target, media_type="application/octet-stream")
