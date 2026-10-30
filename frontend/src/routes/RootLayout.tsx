import { Link, Outlet } from "react-router";
import { ShieldCheck } from "lucide-react";

export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5" aria-hidden />
            FileShare
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
