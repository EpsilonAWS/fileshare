/**
 * Receiver screen — TODO (next step):
 *  1. Read #key with takeLinkSecretFromHash() (also strips it from the URL)
 *  2. getVaultStatus → passkey gate if requiresPasskey (deriveKeys → authToken)
 *  3. unlockVault → decryptMeta → show name, size, countdown (server time), downloads left
 *  4. requestDownload → fetch blob → decryptFile → save
 */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { GlassCard } from "@/components/GlassCard";
import { getVaultStatus } from "@/lib/api-client";
import { describeError } from "@/lib/errors";

export function VaultPage() {
  const { shareToken = "" } = useParams();
  const status = useQuery({
    queryKey: ["vault", shareToken],
    queryFn: () => getVaultStatus(shareToken),
  });

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-md items-center px-5 pb-20">
      <GlassCard className="rise w-full rounded-[28px] p-7">
        <p className="eyebrow">Incoming file</p>
        <h1 className="mt-3 text-2xl font-light">Someone sent you a file</h1>
        <div className="mt-4 text-sm" aria-live="polite">
          {status.isPending && <p className="text-white/50">Checking link…</p>}
          {status.error && <p className="text-red-200">{describeError(status.error)}</p>}
          {status.data && (
            <p className="text-white/60">
              Link is valid. {status.data.requiresPasskey ? "A passkey is required." : "No passkey needed."}
            </p>
          )}
        </div>
      </GlassCard>
    </section>
  );
}
