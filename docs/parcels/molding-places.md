# Parcel: Molding Places

The third places parcel. [Budding Places](../archive/parcels/budding-places.md) built public browsing, and [Places Tiles](../archive/parcels/places-tiles.md) built the global map. This parcel is the admin editor. A person signs in and corrects and curates places.

*Started 13 November 2026 as notes. Not defined yet. The goal, the first screen, and the tasks are still to be agreed.*

## Notes so far

### Scope named by earlier parcels

Budding Places and Places Tiles left these to this parcel: signing in, edit mode, curated text, overlap review, which places are drawn, and approving photographs.

### From Database Honing

[Database Honing](../archive/parcels/database-honing.md) designed these pieces but did not build them, because nothing would use them yet. Their design is in [design.md](../database/design.md) §4.6 and §6, and their reasons are in [decisions.md](../database/decisions.md) records 14 to 16.

- Its task 10: `profiles`, `user_roles`, `has_role()`, contributor policies, and `audit_log`. The `*_by` columns that point at `profiles` are added with it. design.md lists them.
- Its task 11: `images`, `place_images`, a Storage bucket, and upload policies.
- The privileged RPCs: `approve_boundary`, `submit_boundary`, `confirm_source_match`, `review_overlap`, and `review_place_image`. `set_stats_eligibility` stays with the parcel that resumes Stats.
- Items from its Deferred list:
  - The admin overlap screen, and review of the `recognises` links left `proposed` below the confirmation share.
  - Before that screen calls `place_overlaps()`: cut large shapes into pieces (`ST_Subdivide`) or cap the vertices it accepts. One call on Micro compute ran the hosted database out of memory on 12 November 2026.
  - The derived admin review queue over every check's findings and source matches, with the reviewers' stored decisions.
  - `place_edit_requests`, for metadata edits.
  - Community moderation beyond a single editor's review.
  - iNaturalist sign-in, after a spike confirms a user-info endpoint that accepts the OAuth token (record 15).

### Build for today

Add each table, column, and policy with the first screen that uses it. Tables that no screen uses yet stay in Deferred.

## Open questions

- Which screen comes first? For example: approving photographs, the overlap review, or editing a place's text.
- Who signs in at first? Only the user as admin, or contributors too?
- Which sign-in method should Supabase Auth use first?
- Where does the editor live? An edit mode in the map app, or a separate admin route?

## Deferred

Nothing yet.

## Tasks

None yet. They are written when the parcel is defined.
