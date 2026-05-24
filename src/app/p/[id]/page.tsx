import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Builder, type ProjectRow } from "@/components/Builder";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/p/${id}`);

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, template_id, files, messages, checkpoints, share_slug")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const project: ProjectRow = {
    id: data.id,
    name: data.name,
    template_id: data.template_id,
    files: data.files ?? {},
    messages: data.messages ?? [],
    checkpoints: data.checkpoints ?? [],
    share_slug: data.share_slug,
  };

  return <Builder project={project} />;
}
