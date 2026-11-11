-- Database Honing task 06: the decisions on the 74 WDPCA sites with several parcels.
-- The user reviewed each site on 11 November 2026 and decided 35 merges and 39
-- keep-aparts. Each line holds the user's reason. The criteria they follow are in
-- decisions.md, record 20. A merge keeps the place holding the site row, which was
-- the largest parcel in every merged site. A new name drops a part suffix such as
-- /A/ or -1, or names the site where its parcels share no name.
--
-- On a database without WDPCA site rows, such as a fresh local reset, this does
-- nothing. Otherwise every listed site row must be proposed, and none may stay so.

do $$
declare
  decision record;
  merged_total integer := 0;
begin
  if not exists (
    select 1 from public.place_source_ids
    where source_id = 'wdpca' and id_kind = 'wdpa_site_id'
  ) then
    return;
  end if;

  for decision in
    select * from (values
    ('16894', 'keep_apart', null), -- Laguna de los Pozuelos - Zona de amortiguamiento, ARG, 2 parcels. A core and buffer zone, each with different conservation goals.
    ('23', 'keep_apart', null), -- San Guillermo - Zona de amortiguamiento, ARG, 2 parcels. A core and buffer zone, each with different conservation goals.
    ('2409', 'keep_apart', null), -- Ngarkat, AUS, 2 parcels. Different IUCN categories.
    ('24496', 'keep_apart', null), -- Witjira, AUS, 2 parcels. Different IUCN categories.
    ('314990', 'keep_apart', null), -- Paruku, AUS, 2 parcels. Different IUCN categories.
    ('555577374', 'keep_apart', null), -- Yanyuwa (Barni - Wardimantha Awara), AUS, 2 parcels. Different IUCN categories.
    ('555599263', 'keep_apart', null), -- Birriliburu, AUS, 3 parcels. Different IUCN categories. Can potentially merge the two VI sites.
    ('555599266', 'keep_apart', null), -- Girringun, AUS, 2 parcels. Different IUCN categories.
    ('555599267', 'keep_apart', null), -- Wilinggin, AUS, 2 parcels. Different IUCN categories.
    ('555599273', 'keep_apart', null), -- Karajarri, AUS, 2 parcels. Different IUCN categories.
    ('555625644', 'keep_apart', null), -- Matuwa and Kurrara-Kurrara, AUS, 3 parcels. Different IUCN categories.
    ('555759266', 'keep_apart', null), -- Olkola, AUS, 2 parcels. Different IUCN categories.
    ('555759267', 'keep_apart', null), -- Munga-Thirri—Simpson Desert, AUS, 2 parcels. Different IUCN categories.
    ('555759398', 'keep_apart', null), -- Martu, AUS, 2 parcels. Different IUCN categories.
    ('555759400', 'keep_apart', null), -- Wuthathi, AUS, 2 parcels. Different IUCN categories.
    ('555790441', 'keep_apart', null), -- Talaroo, AUS, 2 parcels. Different IUCN categories.
    ('555790551', 'keep_apart', null), -- Maralinga Tjarutja Lands, AUS, 2 parcels. Different IUCN categories.
    ('18612', 'keep_apart', null), -- Lesser Slave Lake Provincial Park, CAN, 2 parcels. Different designations.
    ('23282', 'keep_apart', null), -- Whitemud Watershed Wildlife Management Area, CAN, 2 parcels. Marked merge in the review, kept apart because the IUCN categories differ (III/IV).
    ('23292', 'keep_apart', null), -- Whitewater Lake Wildlife Management Area, CAN, 2 parcels. Different IUCN categories.
    ('302415', 'keep_apart', null), -- Economy River Wilderness Area, CAN, 2 parcels. Marked merge in the review, kept apart because the IUCN categories differ (Ib/Not Reported).
    ('4168', 'keep_apart', null), -- Whiteshell Provincial Park, CAN, 2 parcels. Marked merge in the review, kept apart because the IUCN categories differ (II/III).
    ('4170', 'keep_apart', null), -- Duck Mountain Provincial Park, CAN, 2 parcels. Different designations.
    ('4171', 'keep_apart', null), -- Hecla/Grindstone Provincial Park, CAN, 2 parcels. Different IUCN categories.
    ('555558128', 'keep_apart', null), -- Weeskayjahk Ohtahzhoganeeng, CAN, 2 parcels. Different IUCN categories.
    ('555783753', 'keep_apart', null), -- Balam Kin, MEX, 2 parcels. Different IUCN categories.
    ('555783754', 'keep_apart', null), -- Balam Ku, MEX, 2 parcels. Different IUCN categories.
    ('555783756', 'keep_apart', null), -- Canoas, MEX, 2 parcels. Different IUCN categories.
    ('555783781', 'keep_apart', null), -- Ríos y Montañas de la Comarca Lagunera, MEX, 2 parcels. Different IUCN categories.
    ('555783785', 'keep_apart', null), -- Sierra de Vallejo-Río Ameca, MEX, 2 parcels. Different IUCN categories.
    ('555783786', 'keep_apart', null), -- Sierra Tecuani, MEX, 2 parcels. Different IUCN categories.
    ('555783790', 'keep_apart', null), -- Wanha', MEX, 2 parcels. Different IUCN categories.
    ('93566', 'keep_apart', null), -- Uvs nuur, MNG, 4 parcels. Different names.
    ('555705202', 'keep_apart', null), -- Gilé, MOZ, 2 parcels. Different designations and IUCN categories.
    ('555705344', 'keep_apart', null), -- Niassa, MOZ, 2 parcels. Different designations.
    ('555705345', 'keep_apart', null), -- Chimanimani, MOZ, 2 parcels. Different designations and IUCN categories.
    ('801', 'keep_apart', null), -- Gorongoza, MOZ, 3 parcels. Different names, designations or IUCN categories.
    ('555703187', 'keep_apart', null), -- Gadabédji Biosphere Reserve, NER, 3 parcels. Different zones: core, transition and buffer.
    ('209777', 'keep_apart', null), -- Great Volzhsko-Kamsky, RUS, 5 parcels. Different names.
    ('555635835', 'merge', 'Iberá National Park'), -- Iberá - Núcleo San Nicolás/San Alonso, ARG, 4 parcels. One management unit with same designation.
    ('555635836', 'merge', 'Iberá National Reserve'), -- Iberá - Rincón del Socorro/Iberá, ARG, 2 parcels. One management unit with same designation.
    ('126438', 'merge', null), -- Kau Rock, AUS, 2 parcels. Same name, designation and IUCN category.
    ('126975', 'merge', null), -- South Eneabba, AUS, 2 parcels. Same name, designation and IUCN category.
    ('24133', 'merge', null), -- Walpole-Nornalup, AUS, 2 parcels. Same name, designation and IUCN category.
    ('313745', 'merge', null), -- Warren, AUS, 2 parcels. Same name, designation and IUCN category.
    ('313835', 'merge', null), -- Finke Gorge, AUS, 2 parcels. Same name, designation and IUCN category.
    ('313836', 'merge', null), -- Judbarra / Gregory, AUS, 2 parcels. Same name, designation and IUCN category.
    ('313845', 'merge', null), -- Nitmiluk, AUS, 3 parcels. Same name, designation and IUCN category.
    ('356566', 'merge', null), -- Laynhapuy, AUS, 2 parcels. Same name, designation and IUCN category.
    ('565', 'merge', null), -- Watheroo, AUS, 3 parcels. Same name, designation and IUCN category.
    ('63547', 'merge', null), -- Lake Hurlstone, AUS, 2 parcels. Same name, designation and IUCN category.
    ('63788', 'merge', null), -- Lakeland, AUS, 2 parcels. Same name, designation and IUCN category.
    ('302409', 'merge', null), -- Margaree River Wilderness Area, CAN, 2 parcels. Same name, designation and IUCN category.
    ('302422', 'merge', null), -- Tidney River Wilderness Area, CAN, 3 parcels. Same name, designation and IUCN category.
    ('302434', 'merge', null), -- Liscomb River Wilderness Area, CAN, 2 parcels. Same name, designation and IUCN category.
    ('302435', 'merge', null), -- Cloud Lake Wilderness Area, CAN, 2 parcels. Same name, designation and IUCN category.
    ('302438', 'merge', null), -- French River Wilderness Area, CAN, 2 parcels. Same name, designation and IUCN category.
    ('555515600', 'merge', null), -- Eigg Mountain - James River Wilderness Area, CAN, 2 parcels. Same name, designation and IUCN category.
    ('555515606', 'merge', null), -- Shelburne River Wilderness Area, CAN, 2 parcels. Same name, designation and IUCN category.
    ('555621565', 'merge', null), -- Cape Chignecto Provincial Park, CAN, 2 parcels. Same name, designation and IUCN category.
    ('555758870', 'merge', null), -- Fish And Wildlife Development Fund, CAN, 25 parcels. Same name, designation and IUCN category.
    ('555758871', 'merge', null), -- Fish And Wildlife Development Fund, CAN, 2 parcels. Same name, designation and IUCN category.
    ('555758874', 'merge', null), -- Fish And Wildlife Development Fund, CAN, 3 parcels. Same name, designation and IUCN category.
    ('611', 'merge', null), -- Wood Buffalo National Park Of Canada, CAN, 2 parcels. Same name, designation and IUCN category.
    ('629', 'merge', null), -- Kejimkujik National Park And National Historic Site Of Canada, CAN, 2 parcels. Same name, designation and IUCN category.
    ('65785', 'merge', null), -- Tobeatic Wilderness Area, CAN, 2 parcels. Same name, designation and IUCN category.
    ('124309', 'merge', 'Gobiin baga'), -- Gobiin baga /A/, MNG, 2 parcels. Same name, designation and IUCN category.
    ('145566', 'merge', null), -- Khan khukhii - Khyargas nuur, MNG, 2 parcels. Same name, designation and IUCN category.
    ('313186', 'merge', 'Onon-Balj'), -- Onon-Balj /A/, MNG, 2 parcels. Same name, designation and IUCN category.
    ('313187', 'merge', 'Siilkhemiin nuruu'), -- Siilkhemiin nuruu /B/, MNG, 2 parcels. Same name, designation and IUCN category.
    ('555576563', 'merge', 'Chingeltei khairkhan uul'), -- Chingeltei khairkhan uul-1, MNG, 2 parcels. Same name, designation and IUCN category.
    ('798', 'merge', 'Gobiin ikh'), -- Gobiin ikh /A/, MNG, 2 parcels. Same name, designation and IUCN category.
    ('93538', 'merge', 'Mongol daguur'), -- Mongol daguur /B/, MNG, 2 parcels. Same name, designation and IUCN category.
    ('93647', 'merge', null) -- Sharga, Mankhan, MNG, 2 parcels. Same name, designation and IUCN category.
    ) as d(site_id, decision, new_name)
  loop
    if not exists (
      select 1 from public.place_source_ids
      where source_id = 'wdpca' and id_kind = 'wdpa_site_id'
        and source_record_id = decision.site_id and match_status = 'proposed'
    ) then
      raise exception 'site % is not proposed', decision.site_id;
    end if;
    if decision.decision = 'merge' then
      merged_total := merged_total + public.merge_wdpa_site(decision.site_id, decision.new_name);
    else
      perform public.keep_wdpa_site_apart(decision.site_id);
    end if;
  end loop;

  if exists (
    select 1 from public.place_source_ids
    where source_id = 'wdpca' and id_kind = 'wdpa_site_id' and match_status = 'proposed'
  ) then
    raise exception 'a wdpa_site_id row is still proposed';
  end if;
  if merged_total <> 64 then
    raise exception 'merged % places, expected 64', merged_total;
  end if;
  if exists (
    select 1 from public.places
    where publication_status = 'published'
      and (select count(*) from public.place_boundaries as b
           where b.place_id = places.id and b.is_current) <> 1
  ) or exists (
    select 1 from public.places
    join public.place_boundaries as b on b.place_id = places.id and b.is_current
    where places.publication_status = 'merged'
  ) then
    raise exception 'a published place does not have one current boundary, or a merged one has one';
  end if;
end $$;
