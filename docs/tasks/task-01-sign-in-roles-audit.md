# Task 01 — Sign-in, roles, audit

Parcel: [Molding Places](../parcels/molding-places.md)

Repository: naturewatch-app. This is the parcel's first task, so nothing has to merge first.

## Goal

An admin can sign in by email magic link and sign out, and the app knows whether the signed-in person is an admin. Admins see an Edit/View toggle in a place profile. The toggle has nothing to edit until task 02. The database gets `profiles`, `user_roles`, `has_role()`, and `audit_log`.

Decided 13 November 2026 by the user:

- **Way in.** Visitors see no sign-in button. An admin opens `/signin` and enters an email. While someone is signed in, a small account button sits in the top right corner of the map. It opens a panel in the Landscape and Measure style with the email, the role, and **Sign out**. It first sat beside More info, but the open Measure panel covered it there (changed 13 November 2026 by the user).
- **Sign-up is closed.** The app asks for a link with `shouldCreateUser: false`, and sign-ups are turned off in the hosted Auth settings. Only an existing user gets a link. The user's account is created once by an invite from the Supabase dashboard, then granted `admin`.

## Facts already stored

From the code and the repository on 13 November 2026:

- The tables are in [design.md §4.6](../database/design.md#46-people-images-audit), and the access rules in [§6](../database/design.md#6-access-and-row-level-security). Sign-in is Supabase Auth only ([record 15](../database/decisions.md#15-supabase-auth-profiles-and-roles)).
- No migration mentions `auth.users`, roles, or an audit table. The latest migration is `20261120110000_recognition_places.sql`.
- `src/places/api.ts` creates the one Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and returns none when they are blank.
- The map has no app bar. `AppBarMenuComponent.vue` is a theme toggle that nothing uses. More info is in `SideButtonsComponent.vue`.
- The router has `/`, `/places`, `/places/:id`, and `/about`. The place profile is `PlaceProfileComponent.vue`.
- `.github/workflows/fly.yml` passes the Supabase URL and anon key as build arguments to Fly app `naturewatch` only. `naturewatch-demo` is built without them, so sign-in cannot work there until it gets them.
- `supabase/config.toml` sets the local stack's `site_url` to `http://127.0.0.1:3000`. The app's dev server is `http://localhost:5173`.

## Do this

1. **Migration `20261121100000_people_and_audit.sql`.**
   - `profiles` and `user_roles` as in design.md §4.6. A trigger on `auth.users` insert creates the `profiles` row, with `display_name` null.
   - `has_role(role text)`: `security definer`, `stable`, `set search_path = ''`. True when `(select auth.uid())` has that role. Execute granted to `authenticated` only.
   - `audit_log` as in design.md §4.6, and one trigger function `audit_row()` that writes `old_values` and `new_values` as jsonb, with `actor` from `auth.uid()` (null for statements run by the owner). Add the trigger on `user_roles` only. The other tables get theirs with the task that first edits them.
   - RLS on all three tables, `revoke all … from public, anon, authenticated`. A signed-in user selects their own `profiles` row and their own `user_roles` rows. An admin selects `audit_log`. Nothing is written from the browser in this task.
2. **Local stack.** In `supabase/config.toml`, set `site_url` and `additional_redirect_urls` to the dev server, and `enable_signup = false` under `[auth]`. Leave it on under `[auth.email]`: there it switches the email provider itself off. Inbucket shows the local magic link.
3. **Database tests, `supabase/tests/test_people_local.py`.** On the local stack, in the style of `test_reconcile_local.py`: a new auth user gets a profile; `has_role('admin')` is false, then true after a grant, for that user's JWT claims; `anon` cannot read the three tables; a user cannot read another user's roles; a grant and a revoke each write an `audit_log` row.
4. **Client and store.** Move client creation into `src/plugins/supabase.ts` (the root `.gitignore` ignores `lib/`), with `api.ts` using it unchanged. Add `src/store/AuthStore.ts`: the session from `getSession()` and `onAuthStateChange`, `isAdmin` from `rpc('has_role', { role: 'admin' })`, `editMode` (false on load and on sign-out), `signIn(email)` with `shouldCreateUser: false` and `emailRedirectTo` the current origin, and `signOut()`.
5. **Screens.**
   - `/signin`, `SignInView.vue`: an email field and **Send link**, then "Check your email". If someone is signed in, it shows the email, **Sign out**, and a link back to the map. When the client is not configured, it says so.
   - The account button in the top right corner, shown only while signed in, as above. Every existing control keeps its place.
   - In `PlaceProfileComponent.vue`, an **Edit / View** toggle in the header, shown only when `isAdmin`. It sets `editMode`.
6. **Tests.** Add `AuthStore.spec.ts` with a mocked client, and extend `PlaceProfileComponent.spec.ts` (the toggle shows for an admin only) and the side buttons (the account button shows only while signed in). Run pytest for `supabase/tests`, the catalog suite, the component tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on `/` and `/signin`, signed out, wide and narrow.
8. **User evaluation.** Start the dev server on `http://localhost:5173` against the local stack, and give the URL to the user. The user signs in through Inbucket and evaluates before the pull request is opened.
9. **Docs.**
   - `docs/user/using-the-map.md`: signing in at `/signin`, the account button, and the Edit/View toggle for admins.
   - design.md §4.6: mark `profiles`, `user_roles`, and `audit_log` as in place, naming the migration.
   - `docs/blueprint.md`: the app holds a Supabase Auth session, and where admin writes will go.
10. **Hosted steps, after approval.** Open the pull request first. Then wait for approval, and:
    - Apply the migration with `supabase migration list` and `supabase db push`. Check read-only that the three tables exist and are empty, and that `anon` cannot select them.
    - The user, in the Supabase dashboard: under Authentication → URL Configuration, set the site URL to `https://naturewatch.fly.dev` and add the redirect URLs `http://localhost:5173/**`, `https://naturewatch.fly.dev/**`, `https://naturewatch-demo.fly.dev/**`, and `https://naturewatch.space/**`. Turn off sign-ups for new users. Invite their own email under Authentication → Users.
    - Grant `admin` with a one-off `supabase db query --linked` statement that looks the user up by the email typed in the terminal. Do not commit it or paste the email or user id into the repo or the pull request.
    - After the merge deploys `naturewatch`, the user signs in there, and sees the toggle on a place profile. Check that `audit_log` holds the grant.
    - Record the date applied in the pull request.

## Do not

- Do not add `place_curations`, an editing RPC, or any field that edit mode edits. That is task 02.
- Do not add a visible sign-in button for visitors, or any sign-in provider other than email.
- Do not add the contributor or editor screens, or policies for them.
- Do not call the FastAPI backend.
- Do not add Supabase build arguments for `naturewatch-demo`, or open a pull request into `main`.
- Do not commit an email, a user id, or a key.
- Do not apply the migration or change hosted Auth settings before approval.
- Do not start task 02.

## Done when

- The migration is applied to the hosted database, and the hosted Auth settings are as in step 10.
- The user can sign in and out on the `naturewatch` Fly app, sees the Edit/View toggle on a place profile, and `audit_log` holds the admin grant.
- A visitor sees no sign-in button and no toggle.
- The tests, type check, lint, and browser check pass, with no console errors.
- using-the-map.md, design.md, blueprint.md, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to a commit or a pull request.
