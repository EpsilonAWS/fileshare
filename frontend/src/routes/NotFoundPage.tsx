import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="underline underline-offset-4">
        Send a file
      </Link>
    </section>
  );
}
