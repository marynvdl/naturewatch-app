-- sources, facts, and fact_methods are readable by the places page.
-- They had select grants and no row-level security. Writes stay closed.

alter table public.sources enable row level security;
alter table public.facts enable row level security;
alter table public.fact_methods enable row level security;

create policy sources_select
  on public.sources
  for select
  to anon, authenticated
  using (true);

create policy facts_select
  on public.facts
  for select
  to anon, authenticated
  using (true);

create policy fact_methods_select
  on public.fact_methods
  for select
  to anon, authenticated
  using (true);
