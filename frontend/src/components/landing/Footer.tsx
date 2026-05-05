export function Footer() {
  return (
    <footer className="border-t border-white/5 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-zinc-500 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} Guardwatch · Jetson + DeepStream pilot</p>
        <p className="text-zinc-600">v0 demo · LAN deployment</p>
      </div>
    </footer>
  );
}
