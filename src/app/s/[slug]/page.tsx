import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Builder, type ProjectRow } from "@/components/Builder";

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // RLS policy "public read of shared projects" lets anyone SELECT this.
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, template_id, files, messages, checkpoints, share_slug")
    .eq("share_slug", slug)
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

  return <Builder project={project} readOnly />;
}
