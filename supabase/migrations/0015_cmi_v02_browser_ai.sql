-- CMI + AI Marketing V0.2
-- Browser capture evidence storage + idempotent evidence hash + marketing risks.

alter table public.cmi_evidence
  add column if not exists content_hash text;

create unique index if not exists cmi_evidence_source_hash_unique
  on public.cmi_evidence (source_id, content_hash)
  where content_hash is not null;

alter table public.marketing_strategies
  add column if not exists risks jsonb not null default '[]'::jsonb;

-- Private bucket: screenshots are evidence, not public media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cmi-evidence', 'cmi-evidence', false, 5242880, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CMI evidence screenshots select" on storage.objects;
create policy "CMI evidence screenshots select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'cmi-evidence');

drop policy if exists "CMI evidence screenshots insert" on storage.objects;
create policy "CMI evidence screenshots insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cmi-evidence');

-- Không cấp UPDATE/DELETE ở V0.2 để bảo toàn dấu vết bằng chứng.
