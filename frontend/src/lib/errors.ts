import { ApiRequestError } from "./api-client";
import { DecryptionError } from "./crypto";

/** Human-readable message for any error thrown by the API client or crypto. */
export function describeError(err: unknown): string {
  if (err instanceof DecryptionError) return "This file couldn't be decrypted. The link may be incomplete or the passkey wrong.";
  if (!(err instanceof ApiRequestError)) return "Something went wrong. Please try again.";

  switch (err.code) {
    case "NETWORK_ERROR":
      return "Can't reach the server. Check your connection and try again.";
    case "FILE_TOO_LARGE":
      return "That's over the 100 MB limit.";
    case "VALIDATION_ERROR":
      return "Some of the settings weren't accepted. Please check them and try again.";
    case "RATE_LIMITED":
      return err.details?.retryAfterSeconds
        ? `Too many attempts. Try again in ${err.details.retryAfterSeconds} seconds.`
        : "Too many attempts. Please wait a moment.";
    case "STORAGE_ERROR":
      return "The upload to storage failed. Please try again.";
    case "NOT_FOUND":
      return "This link doesn't exist, or the file has already been deleted.";
    case "EXPIRED":
      return "This file has expired and been destroyed.";
    case "EXHAUSTED":
      return "This file has reached its download limit and been destroyed.";
    case "UPLOAD_INCOMPLETE":
      return "This upload never finished, so there's nothing to download.";
    case "PASSKEY_REQUIRED":
      return "This file needs a passkey.";
    case "WRONG_PASSKEY":
      return err.details?.attemptsRemaining !== undefined
        ? `Wrong passkey. ${err.details.attemptsRemaining} ${err.details.attemptsRemaining === 1 ? "try" : "tries"} left.`
        : "Wrong passkey.";
    case "LOCKED_OUT":
      return "Too many wrong passkeys. This file is locked.";
    case "ACCESS_TOKEN_INVALID":
      return "Your session expired. Unlock the file again.";
    default:
      return "Something went wrong on our side. Please try again.";
  }
}
