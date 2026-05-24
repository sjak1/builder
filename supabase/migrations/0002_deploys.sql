-- Track Cloudflare Pages deployments per project.
alter table public.projects
  add column if not exists deploy_url text,
  add column if not exists last_deployed_at timestamptz;

-- The Cloudflare Pages project name we created for this project (one per
-- builder project, derived from id). We store it so re-deploys reuse it.
alter table public.projects
  add column if not exists cf_project_name text;
