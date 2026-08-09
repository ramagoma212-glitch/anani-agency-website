-- ============================================================
-- RM Digitals — Initial Supabase schema
-- ============================================================
-- Run this once in the Supabase SQL Editor (or via the CLI) on a
-- freshly created project. It creates every table, constraint,
-- index, trigger and Row Level Security policy this site needs.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE /
-- ON CONFLICT DO NOTHING where practical, but this has NOT been
-- tested against a real Supabase project — review it yourself
-- before running it against production. See supabase/README.md.
-- ============================================================


-- ============================================================
-- 1. PROFILES — admin role registry
-- ============================================================
-- Only rows for admin users go here. Regular site visitors never
-- get a profiles row (there is no public sign-up on this site).

create table if not exists public.profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    role       text not null check (role in ('admin')),
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Authenticated users may read their OWN row only (needed so the
-- admin UI can check "am I an admin" after login). No anonymous
-- access at all. No INSERT/UPDATE policy for regular users — role
-- assignment happens only via trusted database access (see README).
create policy "profiles: user can read own row"
    on public.profiles
    for select
    to authenticated
    using (id = auth.uid());


-- ============================================================
-- 2. is_admin() — reusable role-check helper
-- ============================================================
-- SECURITY DEFINER so it can read public.profiles regardless of
-- the caller's own RLS visibility, with an explicit, locked-down
-- search_path so it cannot be tricked by a malicious search_path.
-- It only ever SELECTs and returns a boolean — it cannot be used
-- to modify data, and a user can never use it to grant themselves
-- admin (that only happens via a trusted database insert).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- ============================================================
-- 3. Shared updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- ============================================================
-- 4. PROJECTS — portfolio (replaces Firebase "projects" collection)
-- ============================================================
create table if not exists public.projects (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null unique,
    business_name   text not null,
    category        text not null,
    description     text not null,
    services        text[] not null default '{}',
    image_path      text,
    live_url        text,
    case_study_url  text,
    published       boolean not null default false,
    featured        boolean not null default false,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint projects_slug_format
        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    constraint projects_business_name_length
        check (char_length(business_name) between 1 and 150),
    constraint projects_category_length
        check (char_length(category) between 1 and 60),
    constraint projects_description_length
        check (char_length(description) between 1 and 2000),
    constraint projects_live_url_scheme
        check (live_url is null or live_url ~* '^https?://'),
    constraint projects_case_study_url_scheme
        check (case_study_url is null or case_study_url ~* '^https?://')

    -- category is intentionally free text (not a hardcoded enum) so
    -- new website-development categories can be added without a
    -- migration. Suggested values, enforced at the admin-form level:
    -- Business Website · Ecommerce Website · Landing Page ·
    -- Website Redesign · Portfolio Website · Custom Web Solution
);

create trigger set_projects_updated_at
    before update on public.projects
    for each row
    execute function public.set_updated_at();

create index if not exists idx_projects_published  on public.projects(published);
create index if not exists idx_projects_featured   on public.projects(featured);
create index if not exists idx_projects_sort_order on public.projects(sort_order);

alter table public.projects enable row level security;

create policy "projects: public can read published"
    on public.projects
    for select
    to anon, authenticated
    using (published = true);

create policy "projects: admin can read all"
    on public.projects
    for select
    to authenticated
    using (public.is_admin());

create policy "projects: admin can insert"
    on public.projects
    for insert
    to authenticated
    with check (public.is_admin());

create policy "projects: admin can update"
    on public.projects
    for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "projects: admin can delete"
    on public.projects
    for delete
    to authenticated
    using (public.is_admin());


-- ============================================================
-- 5. REVIEWS — testimonials (replaces Firebase "reviews" collection)
-- ============================================================
create table if not exists public.reviews (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    company       text,
    project_name  text,
    rating        smallint not null,
    message       text not null,
    status        text not null default 'pending',
    featured      boolean not null default false,
    created_at    timestamptz not null default now(),
    approved_at   timestamptz,

    constraint reviews_rating_range      check (rating between 1 and 5),
    constraint reviews_status_values     check (status in ('pending', 'approved', 'rejected')),
    constraint reviews_name_length       check (char_length(name) between 1 and 100),
    constraint reviews_company_length    check (company is null or char_length(company) <= 150),
    constraint reviews_project_name_len  check (project_name is null or char_length(project_name) <= 150),
    constraint reviews_message_length    check (char_length(message) between 1 and 2000)
);

create index if not exists idx_reviews_status     on public.reviews(status);
create index if not exists idx_reviews_created_at on public.reviews(created_at);

alter table public.reviews enable row level security;

create policy "reviews: public can read approved"
    on public.reviews
    for select
    to anon, authenticated
    using (status = 'approved');

create policy "reviews: admin can read all"
    on public.reviews
    for select
    to authenticated
    using (public.is_admin());

-- Anonymous visitors may submit a review, but ONLY as status='pending'.
-- This is enforced here, in the database — not just by omitting a
-- status field from the public form. A forged insert attempting
-- status='approved' is rejected by this WITH CHECK clause.
create policy "reviews: public can insert pending only"
    on public.reviews
    for insert
    to anon, authenticated
    with check (status = 'pending');

create policy "reviews: admin can update"
    on public.reviews
    for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "reviews: admin can delete"
    on public.reviews
    for delete
    to authenticated
    using (public.is_admin());

-- NOTE — spam: this RLS correctly restricts WHAT an anonymous
-- submission can contain, but does NOT stop someone from submitting
-- many reviews in a loop. Anti-spam hardening (honeypot field, rate
-- limiting, Cloudflare Turnstile, or moving submission through a
-- Supabase Edge Function) is intentionally out of scope for this
-- milestone — see supabase/README.md.


-- ============================================================
-- 6. LEADS — future quote/enquiry CRM foundation (not wired up yet)
-- ============================================================
create table if not exists public.leads (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    email             text not null,
    phone             text,
    service_interest  text,
    package_interest  text,
    budget            text,
    subject           text,
    message           text not null,
    source            text not null default 'website',
    status            text not null default 'new',
    notes             text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    constraint leads_status_values check (status in ('new', 'contacted', 'quote_sent', 'won', 'lost')),
    constraint leads_email_format  check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    constraint leads_name_length   check (char_length(name) between 1 and 150),
    constraint leads_message_length check (char_length(message) between 1 and 5000)
);

create trigger set_leads_updated_at
    before update on public.leads
    for each row
    execute function public.set_updated_at();

create index if not exists idx_leads_status     on public.leads(status);
create index if not exists idx_leads_created_at on public.leads(created_at);

alter table public.leads enable row level security;

-- Leads are private customer data. There is intentionally NO
-- anonymous policy of any kind on this table yet — not even INSERT.
-- The contact form still goes through EmailJS this milestone; a
-- secure, validated, anti-spam-protected submission path (likely a
-- Supabase Edge Function) is future work, not this migration.
create policy "leads: admin can read"
    on public.leads
    for select
    to authenticated
    using (public.is_admin());

create policy "leads: admin can insert"
    on public.leads
    for insert
    to authenticated
    with check (public.is_admin());

create policy "leads: admin can update"
    on public.leads
    for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "leads: admin can delete"
    on public.leads
    for delete
    to authenticated
    using (public.is_admin());


-- ============================================================
-- 7. STORAGE — portfolio-images bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('portfolio-images', 'portfolio-images', true)
on conflict (id) do nothing;

create policy "portfolio-images: public can read"
    on storage.objects
    for select
    to anon, authenticated
    using (bucket_id = 'portfolio-images');

-- Best-effort server-side type/size enforcement. Supabase Storage
-- exposes upload metadata via storage.objects.metadata (jsonb), but
-- its exact shape can vary by project/version — VERIFY this against
-- your real project (see the Storage checklist in README.md) rather
-- than trusting this migration alone. Frontend validation in
-- admin.html is the first line of defense either way.
create policy "portfolio-images: admin can upload"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'portfolio-images'
        and public.is_admin()
        and coalesce((metadata->>'size')::bigint, 0) < 5242880
        and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp')
    );

create policy "portfolio-images: admin can update"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'portfolio-images' and public.is_admin())
    with check (bucket_id = 'portfolio-images' and public.is_admin());

create policy "portfolio-images: admin can delete"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'portfolio-images' and public.is_admin());


-- ============================================================
-- 8. Grants note
-- ============================================================
-- This migration intentionally relies on Supabase's default grant
-- model: the anon/authenticated Postgres roles already have
-- table-level DML grants on the public schema out of the box, and
-- Row Level Security (defined above) is the actual enforcement
-- layer, exactly as Supabase expects. No manual GRANT/REVOKE
-- statements were added beyond is_admin()'s EXECUTE grant. If your
-- project has non-default grants, re-verify this assumption.
