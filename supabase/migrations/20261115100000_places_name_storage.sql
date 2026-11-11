-- Keep places.name in the row, so sorting and searching by name do not read TOAST.
-- A place row still carries its outline (places.geom, dropped in task 08). When a row
-- is over the TOAST threshold, Postgres moves the extended text columns out before
-- the outline, whose storage is main. Every name longer than a TOAST pointer was moved
-- out: 12,824 of 51,001 on 11 November 2026. protected_area_window then fetched each
-- of those names again on every comparison of its name sort. It took 2.8 s, against
-- anon's 3 s statement timeout, and /places failed.
--
-- With main storage on name, the outline is moved out first and the name stays in
-- the row.

alter table public.places alter column name set storage main;

-- Store the names that are already out of line again. A plain name = name would keep
-- the TOAST pointer, so the value is rebuilt. This is a storage change only, so it
-- does not touch updated_at. places_set_bbox only fires on an update of geom.

alter table public.places disable trigger places_set_updated_at;

update public.places
set name = name || ''
where pg_column_toast_chunk_id(name) is not null;

alter table public.places enable trigger places_set_updated_at;
