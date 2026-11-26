# Task 01 — Corrections schema and catalog

Parcel: [Corrections](../parcels/corrections.md).

Repository: naturewatch-app. Start from `develop`. The parcel was defined in #465.

## Goal

The database stores a correction to a layer: its polygon, years, action, value, note, photos, submitter, and review. An admin submits one and an admin reviews it, through RPCs only. Photos have a private Storage bucket. Each published threat layer in `layers.json` says which corrections it accepts, and the catalog tests check it. Nothing on the map changes yet. Drawing and the form are task 02.

## Facts already stored

From the code on 26 November 2026:

- **Published threat layers** in `layers.json`, with their years:
  - `built`: `snapshot`, 2023, `sharePaint`, source `v1`.
  - `treeloss`: `cumulative` since 2001, 2016–2025. Tiles from Global Forest Watch.
  - `fire`: `annual`, 2016–2025.
  - `cropland`: `snapshot`, 2024, `sharePaint`, source `v3`.
  - `roads`: `snapshot`, 2025, source `v1`. In the sprout, the `level` band is 1 track, 2 minor, 3 main, 4 major, and the `surface` band is 0 unknown, 1 paved, 2 unpaved (`roads-2026-10-v1.yaml`).
  - `dams`: `static`, points from a Mapbox tileset.
- **Catalog.** `layers.schema.json` sets `additionalProperties: false` on a layer. `types.ts` types it. `catalog.spec.ts` validates `layers.json` against the schema.
- **Patterns to reuse.**
  - `20261124100000_place_images.sql`: a public bucket with admin-only insert, update, and delete policies; `security definer` RPCs that check `has_role('admin')`; `audit_row` triggers; `set_updated_at`.
  - Geometry is `extensions.geometry(MultiPolygon, 4326)`. `submit_boundary` is planned to take GeoJSON through an RPC, because PostGIS does not read GeoJSON on insert (design.md §6).
  - Local database tests in `supabase/tests/test_*_local.py` each run in a transaction that is rolled back, through `connect` in `test_reconcile_local.py`.
  - Migrations reach the hosted database through `supabase db push --linked`.
  - Task 05b's `20261203100000_photo_suggested_from.sql` is applied to the local and hosted databases but not merged, so this migration is `20261204100000`.

## The `corrections` block

Each published threat layer gets a block like this one:

```json
"corrections": {
  "yearly": false,
  "actions": ["remove", "add", "reclassify"],
  "values": [
    { "id": "level", "label": "Road level",
      "options": [{ "value": 1, "label": "Track" }, { "value": 2, "label": "Minor" },
                  { "value": 3, "label": "Main" }, { "value": 4, "label": "Major" }] },
    { "id": "surface", "label": "Surface",
      "options": [{ "value": 1, "label": "Paved" }, { "value": 2, "label": "Unpaved" },
                  { "value": 0, "label": "Unknown" }] }
  ]
}
```

- `actions` lists what the layer accepts. `values` are asked for on `add` and `reclassify`. `remove` takes no value.
- A value has either `options` or `"kind": "share"`, a number from 0 to 1.
- With `yearly: true`, the form asks which of the layer's `years.available` the correction applies to. With `yearly: false`, it applies to the layer's one year.

Per layer:

| Layer | Yearly | Actions | Values |
| --- | --- | --- | --- |
| `cropland` | no | remove, add | share |
| `built` | no | remove, add | share |
| `roads` | no | remove, add, reclassify | level, surface |
| `treeloss` | yes | remove, add | none |
| `fire` | yes | remove, add | none |
| `dams` | no | remove, add | none |

Reclassifying to another year is left out. For tree loss and fire, remove in one year plus add in another does the same.

## Do this

1. **Migration `20261204100000_corrections.sql`.**
   - **`layer_corrections`.**
     - `id` uuid.
     - `layer_id` text: the catalog id, with no foreign key, because the catalog is not in the database.
     - `layer_version` text: the catalog `source.version` at the time, nullable.
     - `geom` MultiPolygon 4326.
     - `years` integer[], not empty.
     - `action`: `remove`, `add`, or `reclassify`.
     - `value` jsonb: an object or null. It must be null for `remove`.
     - `note` text, at most 1,000 characters.
     - `photo_paths` text[], default empty.
     - `review_status`: `submitted`, `approved`, or `rejected`, default `submitted`.
     - `submitted_by`, `reviewed_by`, `reviewed_at`, `review_note`, `created_at`, `updated_at`.
     - Indexes on `(layer_id, review_status)`, and a GiST index on `geom`.
     - `set_updated_at` and `audit_row('id')` triggers.
     - RLS on. Admins can select. Nobody writes the table directly. `revoke all` from `public`, `anon`, and `authenticated`, then grant `select` to `authenticated`.
   - **`submit_correction(p_layer_id, p_layer_version, p_geojson jsonb, p_years int[], p_action, p_value jsonb, p_note)`.** Admin only.
     - Reads the GeoJSON and makes it a MultiPolygon.
     - Refuses an invalid or empty polygon, and more than 5,000 vertices. Task 02 simplifies the polygon before it gets here.
     - Returns the new id, with the status `submitted`.
   - **`review_correction(p_id, p_status, p_note)`.** Admin only. Sets `approved` or `rejected` with the reviewer and the time. It can move a correction back to `submitted`.
   - Revoke execute from `public`, and grant it to `authenticated`.
   - **Bucket `correction-photos`.** Private, 10 MB, JPEG, PNG, or WebP. Admins can select, insert, update, and delete.
   - The database checks only the generic rules above. The per-layer rules (actions, values, years) live in the catalog and are enforced by the form in task 02.
2. **Local test `supabase/tests/test_corrections_local.py`.**
   - A non-admin can neither submit nor read a correction.
   - An admin submits, then approves, rejects, and resubmits.
   - `remove` with a value is refused.
   - An invalid polygon, a polygon with too many vertices, and empty years are refused.
   - A `Polygon` comes back as a MultiPolygon.
   - The bucket is private.
3. **Catalog.**
   - Add `corrections` to the layer definition in `layers.schema.json`, add `CatalogCorrections` to `types.ts`, and add the blocks above to `layers.json`.
   - Add tests in `catalog.spec.ts`:
     - Every published threat layer has a block, and no other layer has one.
     - Values are given only when an action other than `remove` is listed.
     - Option values are unique in each value.
     - A yearly block belongs to a layer with more than one year.
     - The schema rejects an unknown action.
4. **Checks.** Run the catalog vitest suite, the new local pytest, `npm run type-check`, and `npm run lint`.
5. **Hosted.** Apply the migration with `supabase db push --linked` after the user approves. Confirm the table, both RPCs, and the bucket.
6. **Docs.**
   - `docs/database/design.md`:
     - A `layer_corrections` entry, and `review_status` for a correction in §3.
     - The two RPCs in the §6 list of privileged RPCs.
     - Corrections in the table diagram.
   - `docs/blueprint.md`: the `correction-photos` bucket, if it lists buckets.

## Do not

- Do not add UI, drawing, or a review list. That is tasks 02 and 03.
- Do not rasterise or apply corrections. That is the apply side in the Stats Ledger.
- Do not add `corrections` to the recipes in naturewatch-analysis.
- Do not add blocks for layers that are not published.
