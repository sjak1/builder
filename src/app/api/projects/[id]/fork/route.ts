import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

// Fork a publicly-shared project into the current user's account.
// Requires auth. The source project must be shared (RLS allows the read).
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: source, error: readErr } = await supabase
    .from("projects")
    .select("name, template_id, files, messages, checkpoints, share_slug")
    .eq("id", id)
    .single();
  if (readErr || !source) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!source.share_slug) {
    return NextResponse.json({ error: "not shared" }, { status: 403 });
  }

  const { data: created, error: writeErr } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: `${source.name} (fork)`,
      template_id: source.template_id,
      files: source.files,
      messages: source.messages,
      checkpoints: source.checkpoints,
    })
    .select("id")
    .single();
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: created.id });
}
