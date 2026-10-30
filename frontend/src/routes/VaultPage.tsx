/**
 * Receiver flow:
 *   1. Take the key from the #fragment (and strip it from the address bar)
 *   2. GET status → passkey gate if needed
 *   3. Derive keys → POST unlock → decrypt the file name/size in the browser
 *   4. Countdown + download → decrypt → save
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { LoaderCircle } from "lucide-react";
import type { KdfParams } from "@shared/types";
import { GlassCard } from "@/components/GlassCard";
import { FileReady, type VaultSession } from "@/components/vault/FileReady";
import { PasskeyGate } from "@/components/vault/PasskeyGate";
import { VaultMessage, type VaultProblem } from "@/components/vault/VaultMessage";
import { ApiRequestError, getVaultStatus, unlockVault } from "@/lib/api-client";
import { DecryptionError, decryptMeta, deriveKeys, takeLinkSecretFromHash } from "@/lib/crypto";
import { describeError } from "@/lib/errors";
import { centerOf, field } from "@/lib/particle-field";

type Stage =
  | { kind: "checking" }
  | { kind: "unlocking" }
  | { kind: "locked"; kdf: KdfParams }
  | { kind: "ready"; session: VaultSession }
  | { kind: "problem"; problem: VaultProblem; detail?: string; retry?: boolean };

// The key is removed from the URL on first read, so cache it per token
// (React StrictMode runs initialisers twice in development).
const secrets = new Map<string, Uint8Array<ArrayBuffer> | null>();
function linkSecretFor(token: string) {
  if (!secrets.has(token)) secrets.set(token, takeLinkSecretFromHash());
  return secrets.get(token)!;
}

const FATAL: readonly string[] = ["NOT_FOUND", "EXPIRED", "EXHAUSTED", "LOCKED_OUT", "UPLOAD_INCOMPLETE"];

function toProblem(err: unknown): Stage {
  if (err instanceof DecryptionError) return { kind: "problem", problem: "BAD_KEY" };
  if (err instanceof ApiRequestError && FATAL.includes(err.code)) {
    return { kind: "problem", problem: err.code as VaultProblem };
  }
  return { kind: "problem", problem: "GENERIC", detail: describeError(err), retry: true };
}

export function VaultPage() {
  const { shareToken = "" } = useParams();
  const [secret] = useState(() => linkSecretFor(shareToken));
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const cardRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);

  /** Derive keys, unlock, decrypt metadata. Throws on any failure. */
  const unlock = useCallback(
    async (passkey?: { passkey: string; kdf: KdfParams }) => {
      const keys = await deriveKeys(secret!, passkey);
      const unlockBody = passkey ? { authToken: keys.authToken } : {};
      const res = await unlockVault(shareToken, unlockBody);
      const meta = await decryptMeta(keys.fileKey, res.meta.encryptedMeta);
      offsetRef.current = Date.parse(res.meta.serverTime) - Date.now();

      field.set("idle");
      field.burst(centerOf(cardRef.current) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setStage({
        kind: "ready",
        session: {
          token: shareToken,
          keys,
          unlockBody,
          accessToken: res.accessToken,
          vault: res.meta,
          meta,
          offsetMs: offsetRef.current,
        },
      });
    },
    [secret, shareToken],
  );

  const begin = useCallback(async () => {
    if (!secret) {
      setStage({ kind: "problem", problem: "NO_KEY" });
      return;
    }
    setStage({ kind: "checking" });
    try {
      const status = await getVaultStatus(shareToken);
      if (status.requiresPasskey && status.kdf) {
        setStage({ kind: "locked", kdf: status.kdf });
      } else {
        setStage({ kind: "unlocking" });
        field.set("swirl", centerOf(cardRef.current));
        await unlock();
      }
    } catch (err) {
      field.set("idle");
      setStage(toProblem(err));
    }
  }, [secret, shareToken, unlock]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void begin();
  }, [begin]);

  useEffect(() => () => field.set("idle"), []);

  /** Passkey gate: inline message for recoverable errors, full screen for the rest. */
  async function submitPasskey(kdf: KdfParams, passkey: string): Promise<string | null> {
    field.set("swirl", centerOf(cardRef.current));
    try {
      await unlock({ passkey, kdf });
      return null;
    } catch (err) {
      field.set("idle");
      if (err instanceof ApiRequestError && (err.code === "WRONG_PASSKEY" || err.code === "RATE_LIMITED")) {
        return describeError(err);
      }
      setStage(toProblem(err));
      return null;
    }
  }

  const onGone = useCallback((reason: "EXPIRED" | "EXHAUSTED") => {
    setStage({ kind: "problem", problem: reason });
  }, []);

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-md items-center px-5 pb-20">
      <div ref={cardRef} className="rise w-full">
        <GlassCard className="rounded-[28px] p-6 sm:p-8">
          {(stage.kind === "checking" || stage.kind === "unlocking") && (
            <div key="loading" className="swap-in flex flex-col items-center gap-4 py-14 text-center" aria-live="polite">
              <LoaderCircle className="size-7 animate-spin text-sky-200" aria-hidden />
              <p className="text-sm text-white/60">{stage.kind === "checking" ? "Checking the link…" : "Decrypting…"}</p>
            </div>
          )}

          {stage.kind === "locked" && (
            <div key="locked" className="swap-in">
              <PasskeyGate onSubmit={(p) => submitPasskey(stage.kdf, p)} />
            </div>
          )}

          {stage.kind === "ready" && (
            <div key="ready" className="swap-in">
              <FileReady session={stage.session} onGone={onGone} />
            </div>
          )}

          {stage.kind === "problem" && (
            <div key={`problem-${stage.problem}`} className="swap-in">
              <VaultMessage
                problem={stage.problem}
                detail={stage.detail}
                onRetry={stage.retry ? () => void begin() : undefined}
              />
            </div>
          )}
        </GlassCard>
      </div>
    </section>
  );
}
