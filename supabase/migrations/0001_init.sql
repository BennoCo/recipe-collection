-- Rezeptkasten: Datenbank-Setup
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und ausführen.

create extension if not exists pgcrypto;

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  servings text,
  time text,
  ingredients text[] not null default '{}',
  instructions text[] not null default '{}',
  image_url text,
  source_link text,
  added_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists ratings (
  recipe_id uuid not null references recipes(id) on delete cascade,
  person text not null,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (recipe_id, person)
);

alter table recipes enable row level security;
alter table ratings enable row level security;

-- Hinweis zur Sicherheit: Dies ist eine private App für einen kleinen, bekannten
-- Personenkreis ohne individuelles Login. Jeder mit dem (öffentlichen) anon-key
-- der App darf lesen und schreiben. Für sensiblere Daten wäre echte Nutzer-
-- Authentifizierung (Supabase Auth) nötig - für einen Familien-Rezeptkasten ist
-- das bewusst einfach gehalten.
drop policy if exists "recipes_all" on recipes;
create policy "recipes_all" on recipes for all using (true) with check (true);

drop policy if exists "ratings_all" on ratings;
create policy "ratings_all" on ratings for all using (true) with check (true);

-- Storage-Bucket für Rezeptfotos
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

drop policy if exists "recipe images public read" on storage.objects;
create policy "recipe images public read" on storage.objects
  for select using (bucket_id = 'recipe-images');

drop policy if exists "recipe images public insert" on storage.objects;
create policy "recipe images public insert" on storage.objects
  for insert with check (bucket_id = 'recipe-images');
