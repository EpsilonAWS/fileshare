import type { CSSProperties, ReactNode } from "react";
import { Fingerprint, KeyRound, Link2, ShieldCheck, Timer, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { Reveal } from "@/components/Reveal";
import { UploadCard } from "@/components/upload/UploadCard";

const delay = (i: number): CSSProperties => ({ animationDelay: `${120 + i * 110}ms` });

const FEATURES = [
  {
    icon: <ShieldCheck className="size-4" />,
    title: "End-to-end encrypted",
    text: "Locked in your browser. We only ever store scrambled bytes.",
  },
  {
    icon: <Timer className="size-4" />,
    title: "Self-destructing",
    text: "Gone after 10 minutes to 24 hours, or 1–10 downloads.",
  },
  {
    icon: <KeyRound className="size-4" />,
    title: "Passkey locked",
    text: "Mixed into the key itself. Never sent to us.",
  },
];

const STEPS = [
  {
    icon: <Fingerprint className="size-5" />,
    title: "Encrypted on your device",
    text: "Your browser creates a random key and encrypts the file and its name with AES-256-GCM before a single byte is uploaded.",
  },
  {
    icon: <Link2 className="size-5" />,
    title: "The key lives in the link",
    text: "The key sits after the # in your link. Browsers never send that part to a server — so neither we nor our storage can read your file.",
  },
  {
    icon: <Trash2 className="size-5" />,
    title: "Then it destroys itself",
    text: "When the timer runs out or the last download is used, the link stops working and the encrypted file is wiped.",
  },
];

export function UploadPage() {
  return (
    <>
      <section className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-6xl items-center gap-12 px-5 pb-20 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-20">
        <div>
          <p className="eyebrow rise flex items-center gap-3" style={delay(0)}>
            <span className="h-px w-8 bg-white/40" aria-hidden />
            Zero-knowledge file transfer
          </p>
          <h1
            className="rise mt-6 text-[clamp(2.75rem,7vw,5.25rem)] font-light leading-[1.02] tracking-[-0.02em]"
            style={delay(1)}
          >
            Share files
            <br />
            <span className="text-aurora">that vanish.</span>
          </h1>
          <p className="rise mt-6 max-w-md text-base leading-relaxed text-white/65 sm:text-lg" style={delay(2)}>
            Encrypted before they leave your device. Set a timer, a download limit and an optional passkey — then the
            file destroys itself.
          </p>

          <ul className="rise mt-10 hidden max-w-md divide-y divide-white/10 border-y border-white/10 sm:block" style={delay(3)}>
            {FEATURES.map((f) => (
              <Feature key={f.title} icon={f.icon} title={f.title} text={f.text} />
            ))}
          </ul>
        </div>

        <div className="rise" style={delay(2)}>
          <UploadCard />
        </div>
      </section>

      <a
        href="#how"
        className="mx-auto -mt-12 mb-10 hidden w-max items-center gap-3 text-[0.65rem] uppercase tracking-[0.3em] text-white/45 transition hover:text-white lg:flex"
      >
        <span className="grid h-8 w-5 justify-center rounded-full border border-white/30 pt-1.5" aria-hidden>
          <span className="scroll-dot size-1 rounded-full bg-white" />
        </span>
        How it works
      </a>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8">
        <Reveal>
          <p className="eyebrow flex items-center gap-3">
            <span className="h-px w-8 bg-white/40" aria-hidden />
            How it works
          </p>
          <h2 className="mt-5 max-w-xl text-3xl font-light leading-tight sm:text-4xl">
            We built it so <span className="text-aurora">we can't read</span> what you send.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 140}>
              <GlassCard className="h-full rounded-3xl p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-sky-200">
                    {s.icon}
                  </span>
                  <span className="font-mono text-xs text-white/30">0{i + 1}</span>
                </div>
                <h3 className="mt-8 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{s.text}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-white/10 px-5 py-8 text-xs text-white/35 sm:flex-row sm:justify-between sm:px-8">
        <span>Files are encrypted in your browser with AES-256-GCM.</span>
        <span>A student project · AWS Student Builder Group, VIT</span>
      </footer>
    </>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="group flex items-start gap-4 py-4">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.03] text-sky-200 transition-all duration-300 group-hover:border-sky-300/50 group-hover:shadow-[0_0_24px_-4px_rgba(140,190,255,0.7)]">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-sm text-white/50">{text}</span>
      </span>
    </li>
  );
}
