import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewProjectButton } from "./NewProjectButton";
import { SignOutButton } from "./SignOutButton";
import { ProjectCard } from "./ProjectCard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, template_id, updated_at, share_slug")
    .order("updated_at", { ascending: false });

  const hasProjects = projects && projects.length > 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 relative">
      {/* subtle ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-gradient-to-b from-violet-500/[0.06] to-transparent" />

      {/* nav bar */}
      <header className="relative z-10 border-b border-neutral-900/80 backdrop-blur bg-neutral-950/60 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-violet-400" />
            <span className="font-serif text-xl leading-none">Builder</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500 hidden sm:block">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-14 page-enter">
        {/* page heading */}
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <h1 className="font-serif text-5xl tracking-tight mb-2">
              Your projects
            </h1>
            <p className="text-neutral-500 text-sm" suppressHydrationWarning>
              {hasProjects
                ? `${projects.length} project${projects.length === 1 ? "" : "s"} · last opened ${formatRel(projects[0].updated_at)}`
                : "Nothing here yet. Start something."}
            </p>
          </div>
          <NewProjectButton />
        </div>

        {hasProjects ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                id={p.id}
                name={p.name}
                templateId={p.template_id}
                updatedAt={p.updated_at}
                shareSlug={p.share_slug}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-neutral-900/60 to-neutral-950 p-16 text-center">
      <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300 mb-6">
        <FolderOpen size={24} />
      </div>
      <h2 className="font-serif text-3xl mb-2">No projects yet</h2>
      <p className="text-neutral-500 text-sm mb-8 max-w-sm mx-auto">
        Spin up a new project to start chatting with the AI builder. Your work
        autosaves as you go.
      </p>
      <NewProjectButton />
    </div>
  );
}

function formatRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
