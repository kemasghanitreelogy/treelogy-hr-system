-- ============================================================
-- Treelogy HR — Dokumen perusahaan
--
-- Arsip dokumen (legalitas, perizinan, kontrak, …) dengan kode unik yang
-- dibuat DATABASE (sequence + default + unique), meniru pola inventaris.
-- Berkasnya hidup di bucket privat `company-documents`; tabel hanya
-- menyimpan path-nya.
-- ============================================================

create type document_category_t as enum
  ('legal','perizinan','kontrak','keuangan','pajak','sdm','sop','sertifikat','lainnya');

create sequence if not exists document_code_seq;

create or replace function public.document_next_code()
returns text language sql volatile set search_path = '' as $$
  select 'DOC-' || lpad(nextval('public.document_code_seq')::text, 4, '0');
$$;

create table if not exists company_documents (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique default public.document_next_code(),
  name        text not null,
  category    document_category_t not null default 'lainnya',
  doc_number  text,
  issue_date  date,
  -- NULL = berlaku selamanya (mis. akta pendirian).
  expiry_date date,
  file_path   text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_documents_category on company_documents(category);
create index if not exists idx_documents_expiry   on company_documents(expiry_date);

-- updated_at selalu jujur, apa pun jalur update-nya.
create or replace function public.document_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_documents_touch on company_documents;
create trigger trg_documents_touch before update on company_documents
  for each row execute function public.document_touch_updated_at();

-- ---- Permission catalog -------------------------------------
insert into permissions (id, module, label) values
  ('documents.view','documents','Lihat dokumen perusahaan'),
  ('documents.manage','documents','Kelola dokumen (unggah/edit/hapus)')
on conflict (id) do nothing;

-- Admin & HR mengelola; manager dan karyawan cukup melihat.
update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['documents.view','documents.manage']) p)
 where id in ('role-admin','role-hr');

update roles
   set permissions = (select array_agg(distinct p) from unnest(permissions || array['documents.view']) p)
 where id in ('role-manager','role-employee');

-- ---- RLS ----------------------------------------------------
alter table company_documents enable row level security;

drop policy if exists "read documents" on company_documents;
create policy "read documents" on company_documents for select to authenticated
  using (has_perm('documents.view') or has_perm('documents.manage') or is_hr());

drop policy if exists "manage documents" on company_documents;
create policy "manage documents" on company_documents for all to authenticated
  using      (has_perm('documents.manage') or is_hr())
  with check (has_perm('documents.manage') or is_hr());

-- ---- Berkas dokumen (bucket privat) -------------------------
insert into storage.buckets (id, name, public) values ('company-documents','company-documents', false)
  on conflict (id) do nothing;

drop policy if exists "manage upload company documents" on storage.objects;
create policy "manage upload company documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-documents' and (has_perm('documents.manage') or is_hr()));

-- Dokumen perusahaan bisa memuat isi sensitif — membaca berkasnya digate
-- perm dokumen, bukan sekadar "sudah login" seperti foto inventaris.
drop policy if exists "read company documents" on storage.objects;
create policy "read company documents" on storage.objects for select to authenticated
  using (bucket_id = 'company-documents'
         and (has_perm('documents.view') or has_perm('documents.manage') or is_hr()));
