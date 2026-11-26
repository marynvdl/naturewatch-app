-- Wayfinding task 05b: an ecoregion is suggested the approved photographs of the
-- places inside it. The link names the place the photograph came from.

alter table public.place_images
  add column suggested_from_place_id uuid references public.places (id) on delete set null;

comment on column public.place_images.suggested_from_place_id is
  'For a suggestion borrowed from a place inside this one: that place. The Photos tab reads "From <place>".';

create index place_images_suggested_from_place_id_idx
  on public.place_images (suggested_from_place_id)
  where suggested_from_place_id is not null;
