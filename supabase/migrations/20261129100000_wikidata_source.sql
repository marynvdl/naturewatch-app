-- Ecoregions task 06: Wikidata as a source, so a place can be matched to its item.

insert into public.sources (id, source_kind, title, publisher, url, licence_id)
values (
  'wikidata',
  'platform',
  'Wikidata',
  'Wikimedia Foundation',
  'https://www.wikidata.org/',
  'cc0-1.0'
);

comment on column public.place_source_ids.id_kind is
  'For WDPCA: wdpa_site_pid (one parcel, the place) or wdpa_site_id (the site). A proposed wdpa_site_id marks a site whose parcels a person has not yet decided to merge or keep apart. For RESOLVE Ecoregions: eco_id. For Wikidata: wikidata_item, an item id such as Q131377.';
