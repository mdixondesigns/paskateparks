-- User accounts v1 (docs/designs/user-accounts-v1.md, eng review 2026-07-07).
-- profiles: 1:1 with auth.users, created by trigger, guarded by RLS.
--
--   auth.users ──INSERT──▶ trigger handle_new_user() ──▶ public.profiles
--                          (SECURITY DEFINER, owner=postgres,
--                           clamped display_name — can NEVER block signup)
--
-- RLS posture (decisions CM3 + CM4):
--   • SELECT own row only. NOTHING in v1 renders another user's name, so
--     nothing else is exposed. Widen to public read in the SAME migration
--     that ships the leaderboard/photo-credit surface (see TODOS.md).
--   • UPDATE own row only — enforced here, not by app-code WHERE clauses.
--     /account writes go through the user-scoped @supabase/ssr client so
--     these policies are the live security boundary.
--   • No INSERT/DELETE policies: rows are born via the trigger and die via
--     the ON DELETE CASCADE when the auth user is deleted.

CREATE TABLE "profiles" (
  "id" uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  "display_name" text NOT NULL CHECK (char_length("display_name") BETWEEN 1 AND 50),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;

-- Explicit grants: Supabase no longer auto-exposes new tables to the API
-- roles (auto_expose_new_tables retired), so RLS policies alone aren't
-- enough — without these, even the row owner gets 42501 permission-denied.
-- anon deliberately gets NOTHING (deny-all posture, 0001_rls.sql).
-- UPDATE is column-scoped: display_name is the only user-editable field.
GRANT SELECT ON "profiles" TO authenticated;
GRANT UPDATE ("display_name") ON "profiles" TO authenticated;

CREATE POLICY "users read own profile"
  ON "profiles" FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = "id");

CREATE POLICY "users update own profile"
  ON "profiles" FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = "id")
  WITH CHECK ((SELECT auth.uid()) = "id");

-- Trigger failure blocks ALL signups (verified Supabase pitfall, review 3A),
-- so the function clamps its one input: trim; empty/whitespace-only or
-- missing → 'Skater'; truncate to the CHECK's 50 chars (CM6.2).
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    left(coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'display_name'), ''), 'Skater'), 50)
  );
  RETURN NEW;
END;
$$;

-- Owner must be postgres (NOT supabase_auth_admin) so the definer function
-- may write outside the auth schema. postgres owns objects created by
-- migrations, so this is documentation of the requirement, not a change.
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
