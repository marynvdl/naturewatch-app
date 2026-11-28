# Task 05 — Upload a replacement boundary

Parcel: [Shaping Boundaries](../parcels/shaping-boundaries.md).

Repositories: naturewatch-app and naturewatch-analysis. Start from `develop` here and from `main` there. Task 04 merged in #482.

## Goal

An admin, in edit mode, uploads a GeoJSON file on a place's Status tab. The shape is drawn on the map from the file. **Submit** stores it through `submit_boundary` as a proposed version. The Status tab then shows the proposed version with **Approve** and **Discard**. `approve_boundary` makes it current, with `submitted_by` and `reviewed_by` recorded. The new boundary starts `unchecked` and `pending`, and gets QC from `check_boundaries.py` on a laptop. naturewatch-analysis gets one step for rebuilding the places archives after admin changes, with its cost. This settles the parcel's open question on how rebuilds start.

Done on 28 November 2026. The migration was applied to the local database with psql and to hosted after the user approved it. The browser check ran against the local stack on an ecoregion, Malpelo Island xeric scrub, whose original boundary was restored afterwards. It found that a refused file's message stayed after a good file was chosen, so choosing a file now clears it. `check_boundaries.py measure --unchecked` and `load --unchecked` checked the approved upload on the local database. The analysis side is naturewatch-analysis #46.

## Facts already stored

From the code on 28 November 2026:

- **`place_boundaries`** has `derived_from_boundary_id`, `review_status` (`proposed`, `approved`, `rejected`, `withdrawn`), `reviewed_at`, `review_note`, `is_current`, `superseded_at`, `qc_status` (default `unchecked`), and `stats_eligibility` (default `pending`). It has no `submitted_by` or `reviewed_by` yet. `source_id` is required. A CHECK requires a valid, non-empty shape only when `approved`, and a current boundary must be `approved`. A unique index allows one current boundary per place. `geom` is never granted to `anon` or `authenticated`.
- **The audit trigger** on `place_boundaries` fires only on a change to `qc_status`, `stats_eligibility`, or `stats_eligibility_reason`, without `geom`.
- **`submit_correction`** is the intake pattern: it reads GeoJSON with `st_geomfromgeojson`, refuses a type other than Polygon or MultiPolygon, an empty shape, more than 5,000 vertices, or an invalid shape with its reason, and stores `st_multi(shape)`.
- **`check_boundaries.py measure`** reads every current boundary after the last id in `boundary_measures.tsv`, in id order. `load` skips a boundary that is not current or already has findings from this `CHECKER_VERSION`. `VERTEX_CAP` is 100,000.
- **Sources.** `sooty-earth-contributors` (kind `contributors`) exists, for photographs.
- **Stats and links.** `place_stats` rows name a `boundary_id`, so a new boundary has no stats until a stats run. Derived links record the boundary versions they were computed from, and the derive scripts skip a stale one.
- **The Status tab**, in edit mode, starts with `PlaceBoundaryReview.vue`: the Stats line, then the Boundary section with the findings and the verdicts.
- **The map** draws boundaries from the places archives. The protected-area build took about 26 minutes and the recognition build about 12, on spot `e2-standard-8`, roughly $0.07 together (naturewatch-analysis `places/README.md`, 12 November 2026).

## Decided

With the user, 28 November 2026:

- **QC is the laptop script.** `submit_boundary` checks only the type, size, and validity. A new `check_boundaries.py measure --unchecked` measures the current boundaries still `unchecked`, and `load` loads them as now.
- **Two steps.** Submit stores a proposed version. Approve makes it current. Discard rejects it.
- **Rebuilds are by hand, per batch.** One step in naturewatch-analysis, with no schedule and no new code.
- **The 950 Reserve Forests stay deferred.**

## Do this

### naturewatch-app

1. **Migration `20261211100000_replacement_boundary.sql`.**
   - Add `submitted_by` and `reviewed_by` to `place_boundaries`, uuid FK → `profiles`, `on delete set null`.
   - **`submit_boundary(p_place_id uuid, p_geojson jsonb, p_source_url text default null)`**, admin only. The place must exist, have a current boundary, and have no proposed one. It refuses as `submit_correction` does, with a cap of 100,000 vertices. It inserts the next `version_number` as `proposed`, with `derived_from_boundary_id` null, `source_id` `sooty-earth-contributors`, the trimmed `source_url`, and `submitted_by`. It returns the new id.
   - **`approve_boundary(p_boundary_id uuid)`**, admin only, for a proposed boundary. In one transaction, it clears `is_current` on the current boundary and sets its `superseded_at`, then sets the proposed one `approved`, current, `reviewed_by`, and `reviewed_at`. The new boundary stays `unchecked` and `pending`. The old one keeps its QC and eligibility.
   - **`reject_boundary(p_boundary_id uuid)`**, admin only, for a proposed boundary. It sets `rejected`, `reviewed_by`, and `reviewed_at`.
   - **`proposed_boundary(p_place_id uuid)`**, admin only. It returns the place's proposed boundary: id, area, vertex count, `submitted_by`, `created_at`, and its shape as GeoJSON. The size cap at submit keeps it small. It never returns a current boundary's shape.
   - **Audit.** The update trigger also fires on `review_status` and `is_current`. A new trigger audits an insert with `submitted_by` set. Both leave out `geom`.
2. **`supabase/check_boundaries.py`.** `measure --unchecked` reads only current boundaries with `qc_status` `unchecked`, and writes `boundary_measures_unchecked.tsv`. `load --unchecked` loads that file. The rest is unchanged.
3. **Frontend.**
   - **`src/places/replacementBoundary.ts`**: `readBoundaryFile(file)`, which takes a Polygon, a MultiPolygon, a Feature, or a FeatureCollection of polygonal features, and returns one MultiPolygon. It refuses a file over 10 MB, another geometry type, a `crs` other than CRS84, a coordinate outside longitude and latitude, and more than 100,000 vertices, in plain words. Also `submitBoundary`, `approveBoundary`, `rejectBoundary`, and `loadProposedBoundary`.
   - **`PlaceBoundaryReview.vue`**, in the Boundary section:
     - With no proposed boundary, **Replace boundary** opens a file picker. The chosen shape is drawn on the map, the map fits to it, and the section shows its area and point count with **Submit** and **Cancel**, and an optional source link.
     - With a proposed boundary, the section shows its area, point count, and when and by whom it was uploaded, with **Approve** and **Discard**. Its shape is drawn on the map from `proposed_boundary`.
     - After Approve, one line says the map shows the old boundary until the tiles are rebuilt. The Stats line reads the new boundary.
   - **The outline** uses one map source and layer pair for the uploaded or proposed shape, in the corrections blue, removed when the section closes.
4. **Tests.**
   - **pytest.** Submit, approve, and reject, with `submitted_by`, `reviewed_by`, the version number, the superseded boundary, and the audit rows. Refusals: a non-admin, a bad type, an empty or invalid shape, too many vertices, a place with a proposed boundary already, approving or rejecting a boundary that is not proposed. `proposed_boundary` for an admin and a non-admin. `measure --unchecked` picks only `unchecked` current boundaries.
   - **vitest.** `readBoundaryFile` on each input kind and each refusal. The section's states and buttons in `PlaceBoundaryReview.spec.ts`.
   - Run the catalog suite, the full vitest suite, `npm run type-check`, and `npm run lint`.
5. **Browser check** against the local stack, wide and narrow. Upload a small GeoJSON for a local place, check the outline and the numbers, Cancel, then Submit, Discard, Submit again, and Approve. Check that a file with a Point is refused in plain words, and that the other Status tab controls stay visible and work.
6. **Hosted.** Run `supabase db push --linked --dry-run`, then push only after the user approves. No boundary is uploaded on hosted in this task.
7. **Docs.**
   - `docs/user/using-the-map.md`: Replace boundary, Submit, Approve, Discard, and the map lag.
   - `docs/database/design.md` §4.2 and §6: the new columns and functions as *in place*, and `measure --unchecked`.
   - `supabase/README.md`: `measure --unchecked` after approving boundaries.
   - This parcel: the open question on rebuilds is settled, and the Deferred line on the Reserve Forests says an upload is now possible.

### naturewatch-analysis

8. **`places/README.md`**: a short section on rebuilding after admin changes. When boundaries were approved or places hidden, run `submit --replace` for each archive that changed, by hand, after approval. Give the time and cost from the 12 November runs. `docs/pipelines.md` links to it if its status table needs a line. No code change, and no run in this task.

## Do not

- Do not compute QC in the database, or write the thresholds a second time.
- Do not return a current boundary's shape to the browser, or grant `geom`.
- Do not edit vertices on the map. That is task 06.
- Do not change `stats_eligibility` in `approve_boundary`, or run a stats run.
- Do not add a schedule, a workflow, or a Batch run for the rebuild.
- Do not upload a boundary, run QC, or rebuild an archive on hosted.
- Do not push the migration before the user approves.

## Done when

- The migration is applied to the local and hosted databases.
- In edit mode, an admin uploads a GeoJSON file, sees it on the map, submits it, and approves or discards it, with `submitted_by` and `reviewed_by` stored.
- `check_boundaries.py measure --unchecked` and `load --unchecked` work on the local database.
- naturewatch-analysis `places/README.md` has the rebuild step and its cost, in one pull request into `main`, linked from this one.
- The tests and the browser check pass.
- The docs are updated.
- The task is archived on this branch.

## How to work

- The map lags the database. A new current boundary shows on the map only after its archive is rebuilt.
- If a 100,000-vertex upload fails on the local stack for request size or memory, stop and ask before lowering the cap.
