import { Sparkles } from "lucide-react";

export default function BuilderLoading() {
  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      <header className="h-14 border-b border-neutral-800/80 bg-neutral-950 px-5 flex items-center gap-3">
        <div className="flex items-center gap-2.5 pr-3">
          <Sparkles size={18} className="text-violet-400" />
          <span className="font-serif text-[20px] leading-none">Builder</span>
        </div>
        <div className="h-5 w-px bg-neutral-800" />
        <Shimmer className="h-4 w-32 rounded" />
        <div className="flex-1" />
        <Shimmer className="h-8 w-44 rounded-xl" />
        <div className="flex-1" />
        <Shimmer className="h-8 w-20 rounded-md" />
        <Shimmer className="h-8 w-20 rounded-md" />
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[460px_1fr] grid-rows-1">
        <aside className="border-r border-neutral-800 bg-neutral-950 p-6 space-y-6">
          <Shimmer className="h-3 w-24 rounded" />
          <div className="space-y-3">
            <Shimmer className="h-3 w-full rounded" />
            <Shimmer className="h-3 w-5/6 rounded" />
            <Shimmer className="h-3 w-4/6 rounded" />
          </div>
          <div className="space-y-3 pt-4">
            <Shimmer className="h-3 w-full rounded" />
            <Shimmer className="h-3 w-3/4 rounded" />
          </div>
        </aside>

        <main className="min-w-0 min-h-0 flex flex-col">
          <div className="h-12 border-b border-neutral-800/80 px-4 flex items-center gap-2.5 bg-neutral-950">
            <Shimmer className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex-1 bg-gradient-to-b from-neutral-900 to-neutral-950 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="size-10 mx-auto rounded-full border-2 border-neutral-700 border-t-violet-400 animate-spin" />
              <div className="text-sm text-neutral-500">Loading workspace…</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-neutral-800/60 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-neutral-700/40 to-transparent" />
    </div>
  );
}
