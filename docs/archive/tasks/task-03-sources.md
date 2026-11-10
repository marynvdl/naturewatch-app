# Task 03 — Sources

Parcel: [Database Honing](../../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 02 has merged into `develop` (pull requests #388 here and naturewatch-analysis#28).

## Goal

Rename `sources` to `source_releases`, keeping its ids. Add the new `sources` table and `licences`, as in section 4.3 of [design.md](../../database/design.md) and record 9 of [decisions.md](../../database/decisions.md). Store the WDPCA October 2026 citation and show it on the place profile. Update the importer. Apply the migration to the hosted database after approval.

## Facts already stored

- The hosted `sources` table has one row, id `a0c3e5b2-7d14-4f6a-9c88-2b6e1d0a94f3`: `name` WDPCA, `release_month` 2026-10-01, the pinned download URL and checksum, and the timestamps from task 02. All 51,001 places point at it through `places_source_release_id_fkey` (checked 10 November 2026).
- On the hosted database, no function refers to `sources` by name. The view `protected_areas` reads `sources.name as source_name` and `sources.release_month`. A view is bound to the table, so it follows a rename, but a dropped or renamed column it reads must be handled in the same migration.
- `sources` has the constraints `sources_release_month_first` (day 1) and `sources_name_release_month_key`, the policy `sources_select`, and the trigger `sources_set_updated_at` (`20261021120000_records.sql`, `20261110120000_hygiene.sql`).
- `supabase/import_wdpa.py` reads the release in `fetch_source()` by `name` and `release_month`, and checks it against `PINNED_NAME`, `PINNED_RELEASE`, `PINNED_URL`, and `PINNED_SHA256`. Its other queries use only `places.source_release_id`.
- The analysis repo does not read `sources`.
- The place profile builds its source line in `frontend/naturewatch/src/components/PlaceProfileComponent.vue` as `source_name`, the release month, and the hard-coded `PROTECTED_AREA_ATTRIBUTION` from `places/display.ts`. `places/api.ts` selects `release_month` and `source_name` from `protected_areas`. `placePopupContent` in `display.ts` also uses the constant. The app does not call `placePopupElement`.
- WDPCA is used under the WDPA Terms of Use: attribution required, no share-alike, no commercial use without permission from UNEP-WCMC (agreed 10 November 2026).
- The deployed develop app reads `protected_areas` directly. If the view keeps its current columns, the app keeps working between the migration and the frontend deploy.

## Do this

1. Add one migration, `supabase/migrations/<timestamp>_sources.sql`. It is catalog changes and one-row writes only.
   - **`licences`**, as in design.md: `id` text PK, `title`, `url`, `requires_attribution`, `share_alike`, `allows_commercial`, plus `created_at`, `updated_at`, and the `set_updated_at()` trigger. Insert `wdpa-terms`: title "Protected Planet Terms of Use", URL `https://www.protectedplanet.net/en/legal`, `requires_attribution` true, `share_alike` false, `allows_commercial` false.
   - **Rename `sources` to `source_releases`.** Rename its primary key, unique constraint, policy, and trigger to `source_releases_*` names. Drop `sources_release_month_first`; other sources will have exact dates.
   - **The new `sources`**, as in design.md: `id` text PK, `source_kind` (CHECK `dataset`, `publication`, `platform`, `contributors`), `title`, `publisher`, `url`, `doi`, `authors`, `published_year`, `citation`, `licence_id` (FK → `licences`), `described_by_source_id` (FK → `sources`), and the timestamps and trigger. Insert `wdpca`: `dataset`, title "World Database on Protected and Conserved Areas", publisher "UNEP-WCMC and IUCN", URL `https://www.protectedplanet.net`, licence `wdpa-terms`.
   - **Reshape `source_releases`.** Add `source_id` (FK → `sources`), set it to `wdpca`, then make it `not null`. Add `version_label` `not null` ("October 2026"). Rename `release_month` to `released_on`. Add `accessed_on` (date, null). Add `citation` `not null`, with the WDPCA citation for October 2026 as Protected Planet gives it: "UNEP-WCMC and IUCN (2026), Protected Planet: The World Database on Protected and Conserved Areas (WDPCA) [On-line], October 2026, Cambridge, UK: UNEP-WCMC and IUCN. Available at: www.protectedplanet.net." This wording follows `https://www.protectedplanet.net/en/legal`, checked 11 November 2026. Add the unique constraints `(source_id, version_label)` and `(id, source_id)`. The second is for the composite foreign keys in later tasks. Drop `name`.
   - **`protected_areas`.** Replace the view in the same migration, before `name` is dropped. Keep every column in its order: `source_name` now reads `sources.title`, and `release_month` reads `source_releases.released_on`. Append `citation`. Before replacing it, check whether any function returns the view's row type or selects `*` from it.
   - **Access**, as in section 6 of design.md: row-level security on `licences` and `sources`, `revoke all … from public, anon, authenticated`, `select` for `anon` and `authenticated` with a `using (true)` policy, and writes for `service_role` only. Keep the existing access on `source_releases`.
2. Update `supabase/import_wdpa.py`. `fetch_source()` joins `source_releases` to `sources` on `source_id = 'wdpca'` and `version_label = 'October 2026'`, and checks `released_on`, the URL, and the checksum against the pins as now. Rename `PINNED_NAME` to match. Update `supabase/tests/test_import_wdpa.py`.
3. Update `supabase/tests/records_fixture.sql`. Check the pinned row through the new tables. Check that `licences`, `sources`, and `source_releases` have row-level security, that `anon` can read them and cannot write them, that `protected_areas` returns `source_name`, `release_month`, and `citation`, and that a release cannot point at a missing source.
4. Frontend. `places/api.ts` selects `citation` from `protected_areas`. The profile's source line shows the release citation. Remove `PROTECTED_AREA_ATTRIBUTION` from the profile. Leave `placePopupContent` and `placePopupElement` as they are. Update the tests that cover the source line.
5. Run the local database steps in `supabase/README.md` with the fixture, `.venv/bin/python -m unittest supabase/tests/test_import_wdpa.py`, the catalog suite, `npm run type-check`, `npm run lint`, and the places tests.
6. Docs. Mark section 4.3 of `design.md` as *in place* for `licences`, `sources`, and `source_releases`, and say that the provenance columns come in later tasks. Update `docs/blueprint.md` and `supabase/README.md` where they name `sources` or `release_month`. In `docs/user/using-the-map.md`, say that the source line shows the dataset citation. In the parcel, mark weakness 6 as fixed by task 03.
7. Open the pull request. Then report the hosted row counts and that no disk or compute change is needed, and wait for approval. Apply with `supabase migration list` and `supabase db push`. Check read-only that `source_releases` keeps id `a0c3e5b2-7d14-4f6a-9c88-2b6e1d0a94f3`, that 51,001 places still point at it, that `sources` and `licences` hold one row each, and that `protected_areas` returns 51,001 rows with the citation. Record the date applied in the pull request.
8. After the hosted migration, run the dev server against the hosted database. Open a place profile on a wide and a narrow screen, and report the source line.
9. Tick task 03 in the parcel.

## Do not

- Do not change the release id, or any `places` row or column.
- Do not add the provenance columns to other tables. Tasks 05, 07, and 11 add them with their tables.
- Do not add licences or sources that no current record uses.
- Do not download the WDPCA source file or rerun the import.
- Do not merge the pull request before the hosted migration is applied. The new frontend reads `citation`.
- Do not change the disk or compute size.
- Do not commit a database URL, token, password, or login role.
- Do not start task 04.

## Done when

- `source_releases` holds the October 2026 row with its id kept, its source, version label, and citation. `sources` holds `wdpca`, and `licences` holds `wdpa-terms`. This is true locally and on the hosted database.
- The importer and its tests read the new tables, and the fixture passes.
- The place profile shows the WDPCA citation, checked on a wide and a narrow screen.
- The catalog suite, type-check, and lint pass.
- The work is in one pull request into `develop`. Report its address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval before the hosted migration. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
