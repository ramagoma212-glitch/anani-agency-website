/* ============================================================
   SUPABASE CONFIG — placeholder, not yet connected to a real project.
   ============================================================
   HOW TO ACTIVATE:
   1. Create a free project at https://supabase.com
   2. In the SQL Editor, run supabase/migrations/001_initial_schema.sql
   3. In Project Settings → API, copy:
        - the Project URL
        - the "anon" / "publishable" public key
      and paste them into the two constants below, replacing the
      REPLACE_ME placeholders.
   4. In Authentication → Providers, make sure Email/Password is
      enabled, and that public sign-up is switched OFF (this site
      never lets visitors create their own account).
   5. In Authentication → Users, manually create ONE user for
      yourself, then insert a matching row into public.profiles
      with role = 'admin'. Full steps: supabase/README.md.
   6. Open admin.html and log in with that account.

   Until step 3 is done, the dynamic portfolio/reviews features and
   the admin panel safely no-op (see isSupabaseConfigured() below) —
   nothing on the public site breaks in the meantime. The static
   concept portfolio and static testimonials remain the fallback.
   ============================================================

   ⚠️  SECURITY — READ BEFORE EDITING THIS FILE ⚠️
   This file ships to every visitor's browser. NEVER put any of the
   following in here (or anywhere else in frontend JavaScript):
     - the Supabase service_role key
     - a database password
     - a Postgres connection string
     - a JWT signing secret
     - any other backend-only / admin secret
   The only key that belongs in the browser is the public "anon" /
   "publishable" key below — it is safe to expose because real
   security comes from Supabase Auth + Postgres Row Level Security
   + Storage policies (see supabase/migrations/001_initial_schema.sql),
   not from hiding this file.
   ============================================================ */

export const SUPABASE_URL = "REPLACE_WITH_SUPABASE_URL";
export const SUPABASE_PUBLISHABLE_KEY = "REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY";

export function isSupabaseConfigured() {
    return (
        SUPABASE_URL !== "REPLACE_WITH_SUPABASE_URL" &&
        SUPABASE_PUBLISHABLE_KEY !== "REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY" &&
        !!SUPABASE_URL &&
        !!SUPABASE_PUBLISHABLE_KEY
    );
}
