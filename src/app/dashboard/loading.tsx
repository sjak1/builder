import { Sparkles } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-gradient-to-b from-violet-500/[0.06] to-transparent" />

      <header className="relative z-10 border-b border-neutral-900/80 backdrop-blur bg-neutral-950/60 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-violet-400" />
            <span className="font-serif text-xl leading-none">Builder</span>
          </div>
          <div className="flex items-center gap-3">
            <Shimmer className="h-3 w-40 rounded hidden sm:block" />
            <Shimmer className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-14">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <h1 className="font-serif text-5xl tracking-tight mb-2">
              Your projects
            </h1>
            <Shimmer className="h-3.5 w-64 rounded" />
          </div>
          <Shimmer className="h-10 w-36 rounded-md" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} delay={i * 60} />
          ))}
        </div>
      </main>
    </div>
  );
}

function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      className="rounded-xl border border-neutral-800/80 bg-neutral-900/40 overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Shimmer className="h-40 rounded-none" />
      <div className="p-4 space-y-2.5">
        <Shimmer className="h-4 w-3/5 rounded" />
        <Shimmer className="h-3 w-2/5 rounded" />
      </div>
    </div>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-neutral-800/60 ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-neutral-700/40 to-transparent" />
    </div>
  );
}
