/**
 * Receiver screen — TODO:
 *  1. Read #key from location.hash, then history.replaceState to strip it
 *  2. getVaultStatus → passkey gate if requiresPasskey (derive authToken via lib/crypto.ts)
 *  3. unlockVault → decrypt meta → show name, size, countdown (server time), downloads left
 *  4. requestDownload → fetch blob → decrypt → save
 *  Errors: NOT_FOUND, EXPIRED, EXHAUSTED, WRONG_PASSKEY, LOCKED_OUT, RATE_LIMITED
 */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { ApiRequestError, getVaultStatus } from "@/lib/api-client";

export function VaultPage() {
  const { shareToken = "" } = useParams();
  const status = useQuery({
    queryKey: ["vault", shareToken],
    queryFn: () => getVaultStatus(shareToken),
  });

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Receive a file</h1>
      {status.isPending && <p className="text-muted-foreground">Checking link…</p>}
      {status.error && (
        <p className="text-destructive">
          {status.error instanceof ApiRequestError ? status.error.code : "Something went wrong"}
        </p>
      )}
      {status.data && (
        <p className="text-muted-foreground">
          Link is valid. {status.data.requiresPasskey ? "Passkey required." : "No passkey."}
        </p>
      )}
    </section>
  );
}
