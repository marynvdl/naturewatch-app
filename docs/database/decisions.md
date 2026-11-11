# Database decisions

Why the database is designed as it is. The design itself is [design.md](design.md). Each record states the decision, the reason, the alternatives considered, and what the choice costs. A superseded record is marked and kept.

*Status of records 1 to 18: proposed, 9 November 2026, in the [Database Honing](../parcels/database-honing.md) parcel.*

## 1. One `places` table for every kind of Place

**Decision.** Countries, conservation areas, recognitions, ecoregions, and old-growth ecosystems are all rows in `places`.

**Why.** The Stats Pipeline, the Tiles Pipeline, search, relationships, images, and boundaries all treat a Place the same way, whatever its type. One table gives one id space, one foreign key target, and one boundary model. PMTiles features from any archive resolve to the same table.

**Alternatives.** A table per kind (`countries`, `protected_areas`, …). Each kind would need its own boundaries, stats, images, and relationship tables, or a polymorphic reference that loses foreign keys.

**Cost.** Attributes that only some kinds have go into details tables (record 3). A query that wants one kind filters by type.

## 2. Types and categories as two small lookup tables

**Decision.** `place_categories` and `place_types`. A Place points to a type. A type points to a category. Text ids.

**Why.** The hierarchy has two levels. A recursive parent-child table would allow any depth, which nothing needs, and makes every query walk a tree. Administrative nesting, such as a province in a country, is a relationship between Places, not a type hierarchy.

**Changing it later is cheap.** Places only reference a type. Moving `old_growth` under `ecology` changes a few `place_types` rows. Foreign keys to the text ids use `on update cascade`, so an id can be renamed in one statement. Code and policies must not depend on category ids.

**Alternatives.** A Postgres enum, as today. Values cannot easily be removed or renamed, and an enum cannot carry `details_kind`. A self-referencing `place_types` tree has the depth problem above.

## 3. Type-specific attributes in details tables

**Decision.** One table per kind that needs its own attributes: `conservation_area_details`, `recognition_details`, `old_growth_details`. Each has `place_id` as its primary key. Searchable and validated fields are columns. The raw source row is kept in `source_attributes jsonb`.

**Why.** IUCN category, designation, and protection kind are filtered, checked, and shown. They need columns, CHECK constraints, and indexes. Raw extras need none of that.

**Alternatives.**
- Nullable columns on `places`. `places` would grow a column for every kind, most of them null.
- JSONB only. Nothing would be validated, and queries on a key are hard to index.

**Cost.** A join per kind. A trigger checks that the details table matches the place's type.

## 4. Stable identity across source releases

**Decision.** A Place's ids in other datasets are stored in `place_source_ids`, keyed on the source, not the release. An import matches each record to a Place through confirmed rows. It writes a reconciliation report before changing anything. A record that does not match clearly becomes a `proposed` mapping, and a person decides.

**Why.** Today `places` is unique on the release and the WDPCA id. The next release would give every place a new id. Source ids also change between releases: a site can be split into parcels, parcels can be joined, and records disappear. None of these may be resolved silently.

| What the import finds | What it does |
| --- | --- |
| The same SITE_PID, similar shape | Updates through a new boundary version |
| The same SITE_PID, a very different shape | Adds the boundary as `proposed` and flags the place |
| A new SITE_PID inside a known SITE_ID | Creates a `draft` place, and marks the site's `wdpa_site_id` as `proposed` for review |
| A known SITE_PID gone, with its area now under other SITE_PIDs (a split or a join) | Proposes mappings to each. Review chooses a merge or a new place. |
| A new SITE_PID with no candidate | Creates a `draft` place |
| A known SITE_PID that is missing | Keeps `last_seen_release_id`, flags the place. Never withdraws it automatically. |

**Site or parcel.** A Place is one WDPCA parcel, keyed on `SITE_PID`. Record 20 has the decision. Both every `SITE_PID` and each `SITE_ID` are stored. When a person has merged parcels, their SITE_PIDs all point at the kept place.

**Alternatives.** Match on name or geometry alone. That is not reliable enough to run without a person.

## 5. Boundaries are versions in their own table

**Decision.** `place_boundaries` holds every boundary version. One boundary per place at most has `is_current = true`. This is enforced by a partial unique index and a CHECK that a current boundary is approved. Changing the current boundary is one RPC in one transaction.

**Why.** It gives a stable Place, a full history, a source on every version, review before use, and Stats that name the exact version they used.

**Alternatives.**
- **`places.current_boundary_id`.** This needs a foreign key from `places` to boundaries and one back, so inserts need a deferred constraint. It also cannot check that the boundary belongs to the same place without a composite key.
- **History by date range** (`valid_from`, `valid_to` with an exclusion constraint). This suits "what was true on date X". But approval order matters more here than dates, and the range adds complexity.

**Cost.** Every read of a place's shape joins to the current boundary.

## 6. Only accepted boundaries must be valid

**Decision.** `place_boundaries` accepts any non-empty polygonal geometry. A CHECK requires `st_isvalid` only when `review_status = 'approved'`. A repaired geometry is a new version that points back with `derived_from_boundary_id`.

**Why.** An invalid submission must be stored so its problem can be recorded and shown. A boundary the app relies on must never be invalid. Repairing in place would lose the original.

**Alternative.** A CHECK on every row. Invalid submissions would be refused before anyone could review them.

## 7. Boundary quality as findings, with thresholds in code

**Decision.** `boundary_checks` stores one row per check per boundary: the check, its category, the outcome, the measured value, the threshold used, and the checker version. There are three categories: technical, modelling, and processing cost. There are four checks to start: `geometry_valid`, `small_components`, `holes`, and `vertex_count`. Thresholds are set per place type in the QC code, not in the database.

**Why.**
- Findings need history and need to say who or what found them. A column per check on the boundary cannot hold that.
- A multipart boundary is not wrong in itself. Many real protected areas have many parts. So modelling checks warn, they do not fail.
- Processing cost is not a question of trust. It affects Stats eligibility only, never `qc_status`.
- One threshold cannot fit a country and a small reserve.
- Keeping thresholds in versioned code, and recording the threshold used, avoids a configuration table and keeps old findings explainable.

**Alternatives.** A `boundary_check_types` table holding thresholds. It is not needed while one QC program owns the checks.

## 8. Stats eligibility is stored and changed only on purpose

**Decision.** `stats_eligibility` on the boundary: `pending`, `eligible`, or `excluded`, with who set it, when, and why. It is changed only through an RPC. A CHECK allows `eligible` only when `qc_status` is `passed` or `accepted`. Every new boundary starts `pending`. The Stats Pipeline reads only `stats_eligible_boundaries`: the current, eligible boundaries of published places.

**Why.**
- Eligibility cannot be fully derived, because a person may accept a warning or exclude an expensive boundary.
- Storing it with a constraint keeps it consistent with QC.
- Starting at `pending` means approving a new boundary never quietly puts it back into Stats.

**Eligibility is not selection.** Eligibility says a boundary may be processed. A run's selection says which eligible boundaries that run did process. `stat_runs.selection` records the criteria. `stat_run_issues` records boundaries that failed or were skipped.

## 9. One source model with explicit foreign keys

**Decision.**
- `sources` holds anything a record can come from: datasets, publications, platforms such as Wikimedia Commons, and Sooty Earth contributors.
- `source_releases`, the renamed `sources` table, holds versions for the sources that publish them.
- `licences` is separate.
- Every table that needs provenance carries the same columns: `source_id`, `source_release_id`, `source_record_id`, `source_url`.

**Why.**
- One place to describe a source, reused everywhere.
- Real foreign keys from each record, with a composite key so a release always belongs to its source.
- A paper or a Commons image does not have to pretend to be a dataset release.
- Citations sit on the release where they name a version, as WDPCA's do, and on the source otherwise.

**Alternatives.**
- Separate `publishers`, `datasets`, `publications`, and `source_records` tables. These are more correct on paper, but have more joins and nothing that needs them.
- A generic `record_sources (record_type, record_id, source_id)` table. It loses foreign keys.

**Cost.** Some `sources` columns only apply to some kinds, such as `doi` for publications.

## 10. Stats are append-only rows, and the app chooses through a selection

**Decision.**
- `place_stats` holds one row per value: run, place, boundary version, stat, sprout, method, and period. Rows are never updated.
- `stat_selections` names the sprout and method the app shows for each stat and period.
- The view `place_stats_preferred` shows, for the current boundary, the latest value from a successful run of the selected sprout and method.

**Why.**
- **One row per value, not area and percent side by side.** Fire counts and tree height means do not fit `area_km2` and `percent` columns. Area and percent from one calculation stay consistent because they share a run and a boundary. `stats.denominator_stat_id` records what a percentage is a percentage of.
- **No `is_current` on rows.** It would have to be maintained on every rerun and boundary change, and partial reruns make that error-prone. Deriving the preferred value is simpler, and it cannot drift.
- **An explicit selection.** A new sprout or method appears only when chosen, in one row. Each place does not fall back to an older version, because a list that mixes versions misleads.
- **History.** A boundary change, a new sprout, or a new method adds rows. Nothing is lost. A wrong run is marked `retracted`, not deleted. Only problems, not every intermediate result, go into `stat_run_issues`.

**Cost.** The preferred view does a `distinct on`. If the list query becomes slow, the view can be materialised then.

## 11. Relationships are semantic. Spatial overlap is computed, and nothing adds up.

**Decision.**
- `place_relationships` holds typed links (`part_of`, `located_in`, `recognises`, `overlaps`) with origin, review status, and provenance.
- Symmetric types are stored once.
- Spatial overlap is computed on demand by an admin function and not stored. Only a reviewer's decision is stored.
- Derived rows may carry `subject_coverage` and the boundary versions they were measured on.

**Why.**
- A park in two countries, a World Heritage Site covering three parks, and a Ramsar site covering part of a park are all real. The profile needs to show them.
- Storing every intersection between 50,000 places would be large and mostly unused.
- **No relationship type means Stats can be added up.** Places can overlap and leave gaps. Totals need their own calculation on a union.

**Why `recognises` and not `part_of`.** `part_of` claims containment. A World Heritage Site is a statement about a park, and its boundary often does not contain the park or sit inside it.

## 12. Recognitions are Places of their own

**Decision.** World Heritage Sites, Ramsar sites, and later other designations are Places in category `recognition`. Each has its own boundary and source. They are linked to conservation areas with `recognises`, after review.

**Why.**
- Each recognition keeps its identity and boundary, and can be browsed and searched.
- Parks show their recognitions on their profile.
- Nothing is hidden or deleted.
- What the map shows by default is a frontend and catalogue decision. A separate PMTiles archive for recognitions, styled differently, needs no schema change.
- If a reviewer decides two records are the same thing, the Place is merged through `merged_into_place_id`, and the old id still resolves.

**Alternatives.**
- A flag on the protected area. This loses the recognition's own boundary and identity.
- Hiding recognitions as duplicates. Many are not duplicates.

## 13. Conservation area, not protected area

**Decision.** The category is `conservation_area`. It covers WDPCA protected areas and OECMs. Formal protection is recorded in `conservation_area_details`: `protection_kind`, `designation`, `designation_type`, `legal_status`, and IUCN category.

**Why.** WDPCA joins two databases: protected areas and other effective conservation measures. Calling every record a protected area is wrong for OECMs. Protection is an attribute, not a type.

## 14. Shared images, linked per entity

**Decision.** `images` holds the file, its rights, its source, and who uploaded it. `place_images` links an image to a Place, with its own review status, caption, order, and primary flag. Species get `species_images` in the same shape.

**Why.**
- One photo can serve Odzala-Kokoua National Park and the Odzala World Heritage Site. Its licence is stored once, and each link is reviewed on its own.
- Suggestions and approved images share one table with a status, because a suggestion is about an image for a place.
- User uploads only need `uploaded_by` and a Storage path. The uploader and the rights holder are kept apart.

**Alternatives.**
- `images.entity_type` with `entity_id`. This loses foreign keys.
- Separate candidate and approved tables. Approving would mean moving rows.

## 15. Supabase Auth, profiles, and roles

**Decision.** Sign-in is Supabase Auth only. The database adds `profiles` (one per `auth.users` row) and `user_roles` (`contributor`, `editor`, `admin`). There are no custom auth or external-identity tables.

**Why.** `auth.identities` already maps sign-in providers to a user. A new provider adds no tables.

**iNaturalist (deferred).** iNaturalist is an OAuth2 provider and supports PKCE. Supabase supports custom OAuth2 and OIDC providers. A spike must confirm that iNaturalist has a user-info endpoint that accepts the OAuth token. If it does not, a small server function would be needed.

## 16. Each workflow owns its review, plus one audit log

**Decision.** Boundaries, image links, source matches, relationships, and draft places each carry their own review columns. There is no generic change-request engine. `audit_log` records changes to admin-edited tables, by trigger, without geometry.

**Why.** Each workflow has a different payload and different rules. A generic engine would store payloads as JSON, lose foreign keys, and need its own apply step. Metadata edits are the one case without a natural home. They get `place_edit_requests` when that workflow is built.

## 17. Migrate by copying geometry out, not by renaming

**Decision.** Keep `places` as the Place table, with the same ids, foreign keys, policies, and PMTiles ids. Copy geometry into a new `place_boundaries` with new ids, in batches. Drop `places.geom` only after every reader has moved.

**Why.** Renaming `places` to `place_boundaries` would save about 3.5 GB of temporary disk. Growing the disk for the copy is agreed. But a rename means:
- views follow the renamed table while functions follow the name, so the read path splits without an error;
- the public policy and grants follow to the boundaries;
- `facts` would point at boundaries;
- boundary ids would equal place ids, which hides bugs.

The dependency table is in the [parcel](../parcels/database-honing.md#dependency-analysis).

**Cost.** A temporarily larger disk, and a longer backfill on Large compute.

## 18. Text with CHECK instead of enums

**Decision.** Status fields are `text` with a CHECK constraint. Lists that grow, such as types, stats, and licences, are lookup tables.

**Why.** A CHECK can be changed in one migration. An enum value cannot easily be removed or renamed, as the current `place_type` shows.

## 19. A conservation area Place is the whole WDPCA site

**Superseded by [record 20](#20-a-conservation-area-place-is-one-wdpca-parcel) on 11 November 2026.** Task 05 carried it out, and task 05a undid it.

*Decided 10 November 2026 by the user, in task 01 of the [Database Honing](../parcels/database-honing.md) parcel. It settles the open question in record 4.*

**Decision.** One Place per WDPCA `SITE_ID`. Its parcels, one per `SITE_PID`, together form the Place's boundary. `place_source_ids` holds one `wdpa_site_id` row per Place and one `wdpa_site_pid` row per parcel, all pointing at that Place. The 10 km² rule applies to the site's total area.

**Why.**
- WDPCA defines `SITE_ID` as the protected area or OECM as a whole, stable for that site. `SITE_PID` names one parcel, and parcels are split, joined, and renumbered between releases. Keying on the stable id leaves fewer changes for a person to review.
- A park split into parts is one park to a reader. Today the Mongolian parks split into /A/ and /B/, the Iberá nuclei, and the core and buffer zones of a biosphere reserve show as several Places, mostly with the same name.
- The change is small. On 10 November 2026, 74 of 50,889 sites had more than one stored parcel, holding 186 of 51,001 places. None is in South Africa, and none has a fact.

**Alternatives.**
- A Place per parcel, as today. Nothing would be merged, and each parcel would keep its own designation. A site would still show as several Places, and every split or join in WDPCA would need a review per parcel.
- A Place per site that also keeps each parcel as its own linked record, so a parcel's designation and area survive. That is more tables and more review for 0.4% of places.

**Cost.**
- 186 places become 74. The 112 others are set to `merged`, with `merged_into_place_id` pointing at the kept place, so their ids still resolve. The kept place is the one with the largest parcel.
- One designation per Place. 7 of the 74 sites mix designations across parcels. Gorongosa (`SITE_ID` 801) has a National Park parcel and a Buffer Zone parcel. The per-parcel values stay in `source_attributes`, and those Places are flagged for review.
- Parcels under 10 km² were never imported, so a merged boundary leaves them out until the next import brings in every parcel of each site. A site whose parcels are each under 10 km², but which totals at least 10 km², is missing until then too.
- Stats are calculated per site. A parcel-level figure needs its own calculation.

## 20. A conservation area Place is one WDPCA parcel

*Decided 11 November 2026 by the user, in task 05a of the [Database Honing](../parcels/database-honing.md) parcel. It supersedes record 19.*

**Decision.** One Place per WDPCA `SITE_PID`. Parcels of one `SITE_ID` become one Place only when a person decides so. The decision is recorded in the site row's `match_status` (task 06). Until then the site's `wdpa_site_id` row is `proposed`, on its largest parcel. A merge keeps one place, sets the others to `merged` with `merged_into_place_id`, and points their SITE_PIDs at the kept place. The 10 km² rule applies per parcel, as at import.

**Why.**
- Merging by rule lost places worth watching on their own. Gorongosa National Park became part of its buffer zone, and the IUCN Ia cores of seven Mexican category VI sites became part of their sites.
- A fixed rule, such as one place per designation, still decides without a person, and zoned sites with one designation stay merged.
- Every parcel keeps its own designation, IUCN category, area, and boundary.
- A merge is a person's decision that can be undone, as record 4 asks of every unclear match.

**How a site is decided.** The user's criteria from the review of 11 November 2026, applied in this order:

1. The parcels have different IUCN categories: keep apart. This holds when the review first said merge: Whitemud Watershed (III and IV), Economy River (Ib and Not Reported), and Whiteshell (II and III) stayed apart.
2. The parcels have different designations: keep apart.
3. The parcels are zones of one reserve, such as a core, buffer, or transition zone: keep apart, because each zone has its own conservation goals. Gadabédji keeps its three zones apart although they share a name, a designation, and a category.
4. The parcels have the same name apart from a part suffix (` /A/`, ` /B/`, `-1`), the same designation, and the same IUCN category: merge. The merged place drops the suffix.
5. The parcels are one management unit with one designation, under different names: merge, and name the unit (Iberá National Park, Iberá National Reserve).

The 74 decisions, each with its reason, are the worked examples in `supabase/migrations/20261117110000_wdpa_site_decisions.sql`: 35 merges and 39 keep-aparts. A site can be decided again later. 555599263 keeps an IUCN Ia core apart, and its two category VI parcels could still be merged with each other.

**Alternatives.**
- One Place per site (record 19). It merges by rule and loses parcels worth monitoring.
- One Place per site and designation. It still merges by rule, and invents an identity that matches no WDPCA id.

**Cost.**
- `SITE_PID` changes more often between releases than `SITE_ID`. Splits, joins, and renumbering go to review. On 11 November 2026 that concerns 74 of 50,889 sites.
- Until reviewed, a site with several parcels shows as several places, such as the Mongolian /A/ and /B/ parts.
- A site-level figure needs its own calculation on the union. Record 11 already says Stats do not add up.
- `place_boundaries.source_record_id` holds SITE_PID. Task 05's version 1 rows hold SITE_ID, which differs for 190 single-parcel sites and for the 74 superseded site unions.
