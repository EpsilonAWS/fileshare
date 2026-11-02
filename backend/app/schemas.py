from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel, Field

ExpiryOption = Literal["10m", "1h", "24h"]
DownloadLimit = Literal[1, 3, 10]

EXPIRY_SECONDS: Dict[ExpiryOption, int] = {
    "10m": 10 * 60,
    "1h": 60 * 60,
    "24h": 24 * 60 * 60,
}

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_CIPHERTEXT_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024
MAX_PASSKEY_ATTEMPTS = 5
UPLOAD_URL_TTL_SECONDS = 15 * 60
DOWNLOAD_URL_TTL_SECONDS = 60
ACCESS_TOKEN_TTL_SECONDS = 5 * 60


class KdfParams(BaseModel):
    algorithm: Literal["PBKDF2-SHA256"] = "PBKDF2-SHA256"
    iterations: int
    salt: str


class PasskeyProtection(BaseModel):
    authToken: str
    kdf: KdfParams


class CreateUploadRequest(BaseModel):
    sizeBytes: int
    expiry: ExpiryOption
    maxDownloads: DownloadLimit
    passkeyProtection: Optional[PasskeyProtection] = None
    encryptedMeta: str


class CreateUploadResponse(BaseModel):
    uploadId: str
    shareToken: str
    uploadUrl: str
    uploadHeaders: Dict[str, str]
    uploadUrlExpiresAt: str


class CompleteUploadResponse(BaseModel):
    shareToken: str
    expiresAt: str
    maxDownloads: DownloadLimit
    serverTime: str


class VaultStatusResponse(BaseModel):
    requiresPasskey: bool
    kdf: Optional[KdfParams] = None
    serverTime: str


class UnlockRequest(BaseModel):
    authToken: Optional[str] = None


class VaultMetadata(BaseModel):
    encryptedMeta: str
    sizeBytes: int
    expiresAt: str
    downloadsRemaining: int
    maxDownloads: DownloadLimit
    serverTime: str


class UnlockResponse(BaseModel):
    accessToken: str
    accessTokenExpiresAt: str
    meta: VaultMetadata


class DownloadResponse(BaseModel):
    downloadUrl: str
    downloadUrlExpiresAt: str
    downloadsRemaining: int


class ErrorDetails(BaseModel):
    attemptsRemaining: Optional[int] = None
    retryAfterSeconds: Optional[int] = None
    fields: Optional[Dict[str, str]] = None


class ErrorPayload(BaseModel):
    code: str
    message: str
    details: Optional[ErrorDetails] = None


class ApiErrorResponse(BaseModel):
    error: ErrorPayload
