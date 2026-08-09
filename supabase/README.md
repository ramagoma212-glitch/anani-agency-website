# RM Digitals — Supabase setup

This project's backend (portfolio, reviews, and the admin panel) runs on
[Supabase](https://supabase.com) — a hosted PostgreSQL database with
built-in Authentication, Storage, and Row Level Security.

**No Supabase project is connected yet.** Until you complete the steps
below, the public site works entirely on its static content (the concept
portfolio, the static testimonials, and the EmailJS contact form), and
`admin.html` shows a "Supabase Not Connected Yet" message. Nothing on
the public site breaks in the meantime.

---

## ⚠️ Security rule — read this first

**Never put the `service_role` key, a database password, a Postgres
connection string, a JWT signing secret, or any other backend-only
secret into `supabase-config.js` or anywhere else in this repository's
frontend JavaScript.** Only the public **anon / publishable** key
belongs in the browser. Real security comes from Supabase Auth +
Postgres Row Level Security + Storage policies (all defined in
`migrations/001_initial_schema.sql`), never from hiding a key in
client-side code — a browser key can always be read by anyone who
opens DevTools.

---

## Setup steps

1. Create a free project at [supabase.com](https://supabase.com).
2. Save the database password somewhere private (a password manager) —
   you won't need it for this site's day-to-day operation, but keep it safe.
3. In **Project Settings → API**, copy the **Project URL**.
4. In the same page, copy the **anon / publishable public key** (NOT
   `service_role`).
5. **Never** use the `service_role` key in frontend code — see the
   warning above.
6. In the SQL Editor, open and run `migrations/001_initial_schema.sql`
   in full.
7. Confirm the tables exist: `profiles`, `projects`, `reviews`, `leads`
   (Table Editor).
8. Confirm Row Level Security is **enabled** on all four tables (Table
   Editor → each table → RLS toggle).
9. Confirm the `portfolio-images` Storage bucket exists and is public
   (Storage tab).
10. In **Authentication → Providers**, confirm Email is enabled.
11. In **Authentication → Settings**, disable public sign-up (this site
    never lets a visitor create their own account — see `admin.html`,
    which intentionally has no register/sign-up form).
12. In **Authentication → Users**, manually create ONE user for
    yourself (your email + a password).
13. Copy that user's UUID from the Users list.
14. In the SQL Editor, insert your admin profile row using trusted
    database access (not through any app UI):
    ```sql
    insert into public.profiles (id, role)
    values ('paste-your-user-uuid-here', 'admin');
    ```
15. Test anonymous access (see the checklist below) using a private/
    incognito browser window, signed out.
16. If you create a second, non-admin test user, confirm it can log
    into `admin.html` but is immediately signed back out with "not
    authorised as admin" (no `profiles` row for that user).
17. Log in as your admin user and confirm you can manage projects and
    reviews.
18. Try uploading a project image and confirm it lands in
    `portfolio-images` and appears in `projects.image_path`.
19. Paste the Project URL and anon key into `supabase-config.js`,
    replacing both `REPLACE_WITH_...` placeholders.
20. Test everything locally (open the site with a local server, not
    `file://`) before this ever goes anywhere near production.

---

## Security test checklist

Run through this as a real test against your project — not just a code
read-through — before trusting it in production.

| Action | Anonymous visitor | Authenticated non-admin | Admin |
|---|---|---|---|
| Read published projects | YES | YES | YES |
| Read unpublished projects | NO | NO | YES |
| Insert project | NO | NO | YES |
| Update project | NO | NO | YES |
| Delete project | NO | NO | YES |
| Read approved reviews | YES | YES | YES |
| Read pending reviews | NO | NO | YES |
| Submit a pending review | YES | YES | YES |
| Submit an approved review | NO | NO | — (use Approve action) |
| Approve / reject a review | NO | NO | YES |
| Delete a review | NO | NO | YES |
| Upload a portfolio image | NO | NO | YES |
| Read leads | NO | NO | YES (once lead capture is activated) |
| Modify leads | NO | NO | YES (once lead capture is activated) |
| Read profiles | NO (not own) / own row only if authenticated | own row only | own row (or via `is_admin()` internally) |
| Change own role to admin | NO | NO | N/A — role is set only via trusted DB access |

If any row in this table behaves differently than shown, treat it as a
security bug and fix the relevant policy in
`migrations/001_initial_schema.sql` before going further.

---

## Admin bootstrap — how the first admin account gets created

There is no "promote to admin" button anywhere in this app, on purpose.
The intended process is:

1. Create the user manually in Supabase Auth (dashboard, not code).
2. Copy that Auth user's UUID.
3. Insert a matching row into `public.profiles` with `role = 'admin'`,
   using the SQL Editor or another trusted, authenticated database
   connection — never through the website itself.
4. Log in at `admin.html` and confirm access.
5. Confirm a different, non-admin account is correctly denied.

---

## Known limitations / future work

- **Review spam:** Row Level Security correctly restricts *what* an
  anonymous review submission can contain (must be `status = 'pending'`,
  within the length/rating constraints), but it does **not** stop
  someone from submitting many reviews programmatically. Anti-spam
  hardening — a honeypot field, rate limiting, Cloudflare Turnstile, or
  moving submission through a Supabase Edge Function with server-side
  validation — is intentionally **out of scope** for this milestone.
- **Storage file-type/size enforcement:** the `portfolio-images` upload
  policy in the migration checks `metadata->>'size'` and
  `metadata->>'mimetype'` on `storage.objects` as a best-effort,
  server-side backstop. This has **not been verified against a live
  Supabase project** — the exact shape of `storage.objects.metadata`
  can vary by project/version. Verify it yourself (upload an oversized
  or wrong-type file as a test) before relying on it; the frontend
  checks in `admin.html` are the first line of defense either way.
- **Leads / lead-capture pipeline:** the `public.leads` table exists as
  a foundation only. The public contact form still goes through
  EmailJS this milestone. A secure, validated, anti-spam-protected path
  from the contact form into `leads` (most likely a Supabase Edge
  Function) is future work, not part of this migration.
- **Client portal, invoices, quote calculator:** not part of this
  backend foundation — future milestones.
