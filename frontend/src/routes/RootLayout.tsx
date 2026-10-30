import { Link, Outlet } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { CursorTrail } from "@/components/CursorTrail";
import { Logo } from "@/components/Logo";
import { ParticleBackground } from "@/components/ParticleBackground";

export const APP_NAME = "Ephemera";

export function RootLayout() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <ParticleBackground />
      <CursorTrail />
      <header className="relative z-20">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="group flex items-center gap-3" aria-label={`${APP_NAME} home`}>
            <Logo className="size-7 transition-transform duration-700 group-hover:rotate-[200deg]" />
            <span className="text-[0.8rem] font-medium uppercase tracking-[0.42em]">{APP_NAME}</span>
          </Link>
          <nav className="hidden items-center gap-9 text-sm text-white/60 md:flex">
            <a href="/#how" className="transition hover:text-white">
              How it works
            </a>
          </nav>
          <Link to="/" className="btn-ghost px-4 py-2 text-sm">
            Send a file <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>
      <main className="relative z-10 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
