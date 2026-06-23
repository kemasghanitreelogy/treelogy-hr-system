-- Observability untuk web push: catat hasil tiap pengiriman (sent/failed/error)
-- supaya bisa dibuktikan & dipantau ("apakah notif benar terkirim?").
create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_id uuid references public.employees(id) on delete set null,
  tag text,
  title text,
  sent int not null default 0,
  failed int not null default 0,
  error text
);

create index if not exists push_log_created_idx on public.push_log (created_at desc);

-- Terkunci: hanya service-role (server) yang menulis/membaca. RLS aktif tanpa
-- policy publik → klien anon/auth tidak bisa akses; service-role bypass RLS.
alter table public.push_log enable row level security;
