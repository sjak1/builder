import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Sparkles, Zap, Code2, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 relative overflow-hidden">
      {/* ambient gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-[120px]" />
        <div className="absolute -top-20 right-0 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] rounded-full bg-fuchsia-500/5 blur-[120px]" />
      </div>

      {/* nav */}
      <header className="relative z-10 px-8 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <Sparkles size={20} className="text-violet-400" />
          <span className="font-serif text-2xl leading-none">Builder</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="text-sm text-neutral-400 hover:text-white px-3 py-2 rounded-md transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="text-sm bg-white text-neutral-900 hover:bg-neutral-200 px-4 py-2 rounded-md font-medium transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* hero */}
      <main className="relative z-10 max-w-5xl mx-auto px-8 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-neutral-400 mb-8 border border-neutral-800 rounded-full px-4 py-1.5 bg-neutral-900/50 backdrop-blur">
          <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
          Powered by Claude
        </div>

        <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight mb-6">
          Build webapps by{" "}
          <span className="italic bg-gradient-to-r from-violet-300 via-fuchsia-200 to-blue-300 bg-clip-text text-transparent">
            chatting.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Describe what you want. Watch it appear, live, in a real Node.js
          runtime inside your browser. Iterate by talking. Ship when ready.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 bg-white text-neutral-900 hover:bg-neutral-200 px-6 py-3.5 rounded-lg font-medium transition-colors text-base"
          >
            Start building
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a
            href="#how"
            className="text-neutral-300 hover:text-white px-6 py-3.5 rounded-lg transition-colors text-base"
          >
            See how it works
          </a>
        </div>
      </main>

      {/* features */}
      <section id="how" className="relative z-10 max-w-6xl mx-auto px-8 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Zap,
              title: "Instant preview",
              body: "Your app boots in a real WebContainer the moment you hit enter. No deploys, no waiting.",
            },
            {
              icon: Code2,
              title: "Real code, yours",
              body: "Every change is a diff in your project. Inspect, export, take it anywhere.",
            },
            {
              icon: Eye,
              title: "See errors as they happen",
              body: "Runtime errors stream back to chat. The AI fixes its own mistakes without you copying stack traces.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-neutral-800 bg-neutral-900/40 backdrop-blur p-6"
            >
              <div className="size-9 rounded-lg bg-neutral-800/80 flex items-center justify-center mb-4 text-violet-300">
                <f.icon size={18} />
              </div>
              <h3 className="font-medium text-neutral-100 mb-1.5">{f.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-neutral-900 py-8 px-8 text-center text-xs text-neutral-600">
        Built with Next.js, WebContainer, and Claude.
      </footer>
    </div>
  );
}
