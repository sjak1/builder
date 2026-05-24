import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

// Short URL-safe slug. 10 chars of crypto-random base62 ≈ 60 bits of entropy.
function generateSlug(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// POST: enable sharing — generate a slug if one doesn't exist.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Check current state — if already shared, return existing slug.
  const { data: existing } = await supabase
    .from("projects")
    .select("share_slug")
    .eq("id", id)
    .single();
  if (existing?.share_slug) {
    return NextResponse.json({ share_slug: existing.share_slug });
  }

  // Retry a couple of times in case of slug collision.
  for (let i = 0; i < 3; i++) {
    const slug = generateSlug();
    const { error } = await supabase
      .from("projects")
      .update({ share_slug: slug })
      .eq("id", id);
    if (!error) return NextResponse.json({ share_slug: slug });
    if (!error || !String(error.message).toLowerCase().includes("unique")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "could not allocate slug" }, { status: 500 });
}

// DELETE: disable sharing.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("projects")
    .update({ share_slug: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
