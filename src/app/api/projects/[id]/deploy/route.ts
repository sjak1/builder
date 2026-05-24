import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deployToCloudflarePages, projectNameFor, type CfFile } from "@/lib/cloudflare";

type Ctx = { params: Promise<{ id: string }> };

// Reasonable upper bound — Cloudflare Pages caps individual files at 25MB
// and we want to fail fast on anything wildly bigger.
const MAX_PAYLOAD_MB = 30;

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    return NextResponse.json(
      { error: "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set on server" },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { files: Record<string, string> }
    | null;
  if (!body || !body.files || Object.keys(body.files).length === 0) {
    return NextResponse.json({ error: "no files in request" }, { status: 400 });
  }

  const totalBytes = Object.values(body.files).reduce(
    (n, c) => n + Buffer.byteLength(c, "utf8"),
    0,
  );
  if (totalBytes > MAX_PAYLOAD_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `build too large (${(totalBytes / 1024 / 1024).toFixed(1)}MB)` },
      { status: 413 },
    );
  }

  // Confirm the project exists and belongs to caller (RLS enforces this too).
  const { data: project, error: readErr } = await supabase
    .from("projects")
    .select("id, cf_project_name")
    .eq("id", id)
    .single();
  if (readErr) {
    return NextResponse.json(
      { error: `db read failed: ${readErr.message}` },
      { status: 500 },
    );
  }
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const projectName = project.cf_project_name || projectNameFor(id);

  const files: CfFile[] = Object.entries(body.files).map(([path, contents]) => ({
    path,
    contents,
  }));

  let result;
  try {
    result = await deployToCloudflarePages({
      accountId,
      token,
      projectName,
      files,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  // Persist URL + name so subsequent deploys reuse the same CF Pages project.
  await supabase
    .from("projects")
    .update({
      deploy_url: result.url,
      last_deployed_at: new Date().toISOString(),
      cf_project_name: projectName,
    })
    .eq("id", id);

  return NextResponse.json({
    url: result.url,
    deployment_id: result.id,
    project_name: projectName,
  });
}
