# Task 01 — Boundary QC and Stats eligibility

Parcel: [Shaping Boundaries](../../parcels/shaping-boundaries.md).

Repository: naturewatch-app. Start from `develop`. The parcel was defined in #470.

## Goal

Every current boundary has QC findings in `boundary_checks`, a `qc_status`, and a `stats_eligibility`. The Stats Ledger reads `stats_eligible_boundaries`. An admin can change eligibility through `set_stats_eligibility`, but no screen calls it yet. That is task 03. Nothing on the map changes.

Applied to the hosted database on 26 and 27 November 2026, after the user approved each step. `measure` read all 51,783 current boundaries; none was invalid. The user chose one setting for every place type (`DEFAULT_THRESHOLDS` in the script) and the 100,000-vertex cap. `load` wrote 207,132 findings in 13 minutes, in batches of 500, because each update re-runs the boundary's validity CHECK and area. 650 boundaries are flagged, 51,000 are eligible, and 783 stay `pending`: the flagged ones and 133 that passed but are over the cap.

## Facts already stored

From the code and the hosted database on 26 November 2026:

- **The design is written.** [design.md §4.2](../../database/design.md#42-boundaries-and-quality) has the columns, the constraints, `boundary_checks`, the four starting checks, and the view. [Record 7](../../database/decisions.md#7-boundary-quality-as-findings-with-thresholds-in-code) covers the thresholds in code, and [record 8](../../database/decisions.md#8-stats-eligibility-is-stored-and-changed-only-on-purpose) covers eligibility.
- **Hosted size.** There are 51,783 current boundaries, all of them published. Their geometry is about 3.5 GB. About 230 have over 100,000 vertices, and the largest has about 1.9 million.
  - By type: 39,457 conservation areas, 8,770 Natura 2000 sites, 1,087 Ramsar sites, 1,029 Emerald sites, 846 ecoregions, 220 biosphere reserves, 207 World Heritage Sites, and 167 other recognitions.
  - Current boundaries are approved, so a constraint already makes them valid and not empty.
- **Patterns to reuse.**
  - `derive_ecoregion_links.py` and `derive_recognises.py` use `compute` and `load` steps. `compute` reads `st_asbinary(geom)` in batches and writes a TSV in the work directory, and it resumes after a stop. `load` writes the TSV in one transaction. The connection is the importer's: `DATABASE_URL` locally, or `SUPABASE_ACCESS_TOKEN` for a short-lived hosted login role.
  - `place_boundaries` has row security on and a column-level `grant select (…)` to `authenticated` that leaves out `geom` (`20261113100000_place_boundaries.sql`).
  - Admin RPCs are `security definer` with `set search_path = ''`, check `has_role('admin')`, and grant execute to `authenticated` only.
  - Local database tests are `supabase/tests/test_*_local.py`, run with `../naturewatch-analysis/.venv/bin/python -m pytest`.
  - The latest migration is `20261205100000_correction_queue.sql`.

## Decided

- QC runs on this machine, not in the database (parcel, Design).
- The script sets the first eligibility. A boundary becomes `eligible` when its `qc_status` is `passed` and it is under the vertex cap. Everything else stays `pending`.
- **The thresholds come from measuring first.** `measure` writes the values for every current boundary without writing to the database. Then I show the distributions per place type and propose the thresholds and the vertex cap. The user approves them before `load`. The suggested cap is 100,000 vertices, the line the Stats Ledger already uses for heavy boundaries.
- **QC status.**
  - `fail` on `geometry_valid` sets `flagged`. It cannot happen for a current boundary today.
  - `warn` on `small_components` or `holes` sets `flagged`.
  - Otherwise the status is `passed`.
  - `vertex_count` warns above the cap. It never changes `qc_status`.
- **The `audit_row` trigger on `place_boundaries` waits for task 03**, the first screen that edits a boundary (design.md §4.6). The seed is not audited row by row. `checker_version` and `stats_eligibility_reason` say where it came from.

## Do this

1. **Migration `20261206100000_boundary_qc.sql`.**
   - **Columns on `place_boundaries`.**
     - `qc_status`, default `unchecked`.
     - `stats_eligibility`, default `pending`.
     - `stats_eligibility_reason`, `stats_eligibility_set_by` (FK to `profiles`, `on delete set null`), and `stats_eligibility_set_at`.
     - The CHECK constraints from design.md §4.2, including "`eligible` only when `passed` or `accepted`".
     - Add the new columns to the column-level select grant for `authenticated`.
   - **`boundary_checks`.** It has the columns and the index from design.md §4.2, with `outcome` and `check_category` as CHECK.
     - Row security on. Admins can select it.
     - `revoke all` from `public`, `anon`, and `authenticated`, then grant `select` to `authenticated`.
     - Nobody writes it from the browser.
   - **`stats_eligible_boundaries`.** The view from design.md §4.2, with `security_invoker`. It is granted to `service_role` only.
   - **`set_stats_eligibility(p_boundary_id, p_eligibility, p_reason)`.** Admin only.
     - It requires a reason for `excluded`, and for `eligible` when `qc_status` is not `passed`.
     - It sets the `set_by` and `set_at` columns.
     - An `eligible` that the constraint refuses comes back as a clear error.
2. **Script `supabase/check_boundaries.py`.** It has these steps:
   - `measure`: read-only on the database. It reads the current boundaries in batches and computes the four checks in shapely:
     - validity;
     - the number of parts, and the share of parts below the per-type size;
     - the number of holes, and the share of tiny holes;
     - the number of vertices.

     It writes `boundary_checks.tsv` and resumes after a stop. The checks are measured with a size in square kilometres, on an equal-area projection (EPSG:6933, as in `derive_ecoregion_links.py`).
   - `summary`: from the TSV, it prints the percentiles per place type for each measure, and how many boundaries each proposed threshold would flag.
   - `load`: in one transaction, it inserts the `boundary_checks` rows with `checker_version` (for example `check_boundaries 1`) and each threshold used. It sets `qc_status`, and sets `eligible` with a reason on the boundaries that qualify. A boundary that is no longer current is skipped.
   - The thresholds per place type and the vertex cap are constants in the script, approved after `measure`.
3. **Tests.**
   - `supabase/tests/test_check_boundaries.py`: the four checks on small shapes, and the rules for the outcome and the status.
   - `supabase/tests/test_boundary_qc_local.py`:
     - the constraints;
     - `set_stats_eligibility` for an admin and a non-admin, including the reason rules;
     - the view leaves out pending, excluded, not current, and unpublished boundaries;
     - `boundary_checks` is unreadable for a non-admin;
     - `load` against the local database.
4. **Hosted**, each step after the user approves it:
   1. `supabase db push --linked` (dry run first).
   2. `measure` against the hosted database. It reads about 3.5 GB of geometry once, which is database egress. Then `summary`, and the thresholds for approval.
   3. `load`.
   4. Report the counts by `qc_status` and eligibility per place type.
5. **Docs.**
   - `docs/database/design.md` §4.2: mark the QC columns, `boundary_checks`, the view, and `set_stats_eligibility` as in place, with the migration, the script, and the date. Record the thresholds and the cap by pointing at the script, not by copying them.
   - The Stats Ledger parcel's line that says it waits for eligibility.

## Do not

- Do not add a screen or a queue. That is task 03.
- Do not change `place_overlaps()`. That is task 02.
- Do not add `approve_boundary`, `submit_boundary`, or the `submitted_by` and `reviewed_by` columns. That is task 05.
- Do not run any geometry check in the hosted database.
- Do not push the migration, or run `measure` or `load` against hosted, before the user approves each one.

## Done when

- The migration is applied to the local and hosted databases.
- Every current hosted boundary has `boundary_checks` rows, a `qc_status` other than `unchecked`, and an eligibility set by the approved rule.
- `stats_eligible_boundaries` returns the eligible boundaries.
- The unit tests and the local tests pass.
- design.md is updated.
- The task is archived on this branch.
