export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl bg-slate-900/40 border border-slate-800 rounded-2xl p-10 shadow-2xl backdrop-blur-sm">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
          fileshare
        </h1>
        <p className="mt-4 text-lg text-slate-300">
          Initialized seamlessly with <span className="font-semibold text-white">Aayush's DevKit</span>.
        </p>
        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <a
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium text-white transition-colors"
          >
            Next.js Docs
          </a>
          <a
            href="#agents"
            className="px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 font-medium text-slate-200 transition-colors"
          >
            Check AGENTS.md
          </a>
        </div>
      </div>
    </main>
  );
}
