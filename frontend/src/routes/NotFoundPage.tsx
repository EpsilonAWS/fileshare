import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-md flex-col items-center justify-center gap-6 px-5 pb-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="text-4xl font-light">
        Nothing <span className="text-aurora">here.</span>
      </h1>
      <p className="text-white/55">This page doesn't exist — or it already vanished.</p>
      <Link to="/" className="btn-primary px-6 py-3 text-sm">
        Send a file
      </Link>
    </section>
  );
}
