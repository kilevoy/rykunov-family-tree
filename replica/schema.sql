-- Родословная: схема Postgres (Supabase). Клон ядра Genery «Древо Жизни», личный инструмент семьи.
-- Доступ: RLS на каждой таблице через членство в дереве (tree_members).
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- дерево (рабочее пространство) и доступ ----------
create table trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on trees (owner_id);

create table tree_members (
  tree_id uuid not null references trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  -- видит записи с privacy_level не выше этого значения (0..10), аналог «уровня конфиденциальности» Genery
  max_privacy smallint not null default 5 check (max_privacy between 0 and 10),
  created_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);
create index on tree_members (user_id);

create table tree_invites (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor','viewer')),
  max_privacy smallint not null default 5 check (max_privacy between 0 and 10),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on tree_invites (tree_id);

-- ---------- справочники ----------
create table places (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  name text not null,                 -- «с. Колок, Оренбургская обл.»
  alt_names text[] not null default '{}', -- прежние названия
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on places (tree_id, name);

create table families (               -- «роды» Genery: группа по фамилии
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  name text not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on families (tree_id, name);

create table sources (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  title text not null,                -- «Метрическая книга с. Колок, 1913»
  citation text,                      -- архив, фонд, опись, дело, лист
  url text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on sources (tree_id, title);

-- ---------- персоны ----------
create table persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  surname text not null default '',
  given_name text not null default '',
  patronymic text not null default '',
  maiden_name text,
  extra_names jsonb not null default '{}',   -- пользовательские части имени («Прозвище»)
  sex text not null default 'U' check (sex in ('M','F','U')),
  is_living boolean not null default false,
  has_children text not null default 'unknown' check (has_children in ('yes','no','unknown')),
  family_id uuid references families(id) on delete set null,
  residence_place_id uuid references places(id) on delete set null,
  occupation text,
  comment text,
  is_favorite boolean not null default false,
  privacy_level smallint not null default 0 check (privacy_level between 0 and 10),
  reliability smallint not null default 0 check (reliability between 0 and 10),
  main_photo_id uuid,                        -- fk на documents добавлен ниже
  main_photo_crop jsonb,                     -- {x,y,w,h} в долях 0..1
  gedcom_xref text,                          -- @I12@ при импорте
  version int not null default 1,            -- оптимистичная блокировка
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on persons (tree_id, surname, given_name);
create index on persons (family_id);
create index on persons (residence_place_id);
create unique index on persons (tree_id, gedcom_xref) where gedcom_xref is not null;
create index persons_name_trgm on persons using gin ((surname||' '||given_name||' '||patronymic||' '||coalesce(maiden_name,'')) gin_trgm_ops);

-- ---------- события и участники ----------
create table event_types (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  code text not null,                 -- birth, death, marriage, baptism, residence, education, ...
  title text not null,
  is_favorite boolean not null default false,
  gedcom_tag text,                    -- BIRT, DEAT, MARR, BAPM, RESI, EDUC, EVEN
  unique (tree_id, code)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  event_type_id uuid not null references event_types(id) on delete restrict,
  -- дата: исходный текст + разобранная форма
  date_text text,                     -- «26.05.1799», «около 1717», «между 1811 и 1817»
  date_kind text not null default 'none'
    check (date_kind in ('none','exact','about','before','after','between','from_to')),
  calendar text not null default 'gregorian' check (calendar in ('gregorian','julian')),
  date_from date,
  date_to date,
  date_sort date,                     -- для сортировки хронологии
  place_id uuid references places(id) on delete set null,
  details jsonb not null default '{}',-- причина смерти, учебное заведение и т.п.
  comment text,
  is_favorite boolean not null default false,
  privacy_level smallint not null default 0 check (privacy_level between 0 and 10),
  reliability smallint not null default 0 check (reliability between 0 and 10),
  gedcom_xref text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint date_order check (date_to is null or date_from is null or date_to >= date_from)
);
create index on events (tree_id, event_type_id);
create index on events (tree_id, date_sort);
create index on events (place_id);

create table event_participants (
  event_id uuid not null references events(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  tree_id uuid not null references trees(id) on delete cascade,
  -- ядро ролей: child, father, mother (рождение), husband, wife (брак), subject (смерть, жительство), godparent, witness, other
  role text not null check (role in ('subject','child','father','mother','husband','wife','godparent','witness','other')),
  role_label text,
  position int not null default 0,
  primary key (event_id, person_id)    -- персона один раз на событие
);
create index on event_participants (person_id);
create index on event_participants (tree_id, role);
-- одно событие — не более одного отца, одной матери, одного ребёнка
create unique index event_single_role on event_participants (event_id, role)
  where role in ('child','father','mother','husband','wife');

-- ---------- документы и фото ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  title text,
  storage_path text not null,         -- путь в Storage: {tree_id}/{id}/{file}
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  doc_date_text text,
  doc_date_sort date,
  place_id uuid references places(id) on delete set null,
  comment text,
  privacy_level smallint not null default 0 check (privacy_level between 0 and 10),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on documents (tree_id, doc_date_sort);
alter table persons add constraint persons_main_photo_fk
  foreign key (main_photo_id) references documents(id) on delete set null;

create table document_links (         -- документ привязан к персоне или событию
  document_id uuid not null references documents(id) on delete cascade,
  tree_id uuid not null references trees(id) on delete cascade,
  person_id uuid references persons(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  position int not null default 0,
  check ((person_id is not null)::int + (event_id is not null)::int = 1)
);
create unique index on document_links (document_id, person_id) where person_id is not null;
create unique index on document_links (document_id, event_id) where event_id is not null;
create index on document_links (person_id);
create index on document_links (event_id);

create table photo_tags (             -- отметки людей на фото
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  tree_id uuid not null references trees(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  x real not null check (x between 0 and 1),
  y real not null check (y between 0 and 1),
  w real not null check (w > 0 and w <= 1),
  h real not null check (h > 0 and h <= 1)
);
create index on photo_tags (document_id);
create index on photo_tags (person_id);

-- ---------- источники и задачи ----------
create table source_links (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  tree_id uuid not null references trees(id) on delete cascade,
  person_id uuid references persons(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  page text,
  quote text,
  check ((person_id is not null)::int + (event_id is not null)::int + (document_id is not null)::int = 1)
);
create index on source_links (source_id);
create index on source_links (person_id);
create index on source_links (event_id);
create index on source_links (document_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  person_id uuid references persons(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tasks (tree_id, done);
create index on tasks (person_id);
create index on tasks (event_id);

-- ---------- импорт/экспорт, аудит ----------
create table gedcom_imports (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  file_name text not null,
  encoding text,
  gedcom_version text,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  report jsonb not null default '{}',   -- что не разобрано / потеряно
  created_at timestamptz not null default now()
);
create index on gedcom_imports (tree_id);

create table audit_log (
  id bigint generated always as identity primary key,
  tree_id uuid not null references trees(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('insert','update','delete')),
  diff jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (tree_id, created_at desc);

-- ---------- вспомогательное ----------


create or replace function can_read(t uuid, lvl smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tree_members m
    where m.tree_id = t and m.user_id = auth.uid() and lvl <= m.max_privacy);
$$;
create or replace function can_write(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tree_members m
    where m.tree_id = t and m.user_id = auth.uid() and m.role in ('owner','editor'));
$$;
create or replace function is_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tree_members m
    where m.tree_id = t and m.user_id = auth.uid() and m.role = 'owner');
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); new.version = coalesce(old.version, 0) + 1; return new; end $$;
-- у таблиц без колонки version триггер не вешаем (см. ниже отдельную функцию)
create or replace function touch_updated_at_only() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger persons_touch before update on persons for each row execute function touch_updated_at();
create trigger events_touch  before update on events  for each row execute function touch_updated_at();
create trigger trees_touch     before update on trees     for each row execute function touch_updated_at_only();
create trigger places_touch    before update on places    for each row execute function touch_updated_at_only();
create trigger families_touch  before update on families  for each row execute function touch_updated_at_only();
create trigger sources_touch   before update on sources   for each row execute function touch_updated_at_only();
create trigger documents_touch before update on documents for each row execute function touch_updated_at_only();
create trigger tasks_touch     before update on tasks     for each row execute function touch_updated_at_only();

-- Родственные связи считаем из событий (как в Genery): родители ребёнка = участники «рождения» с ролями father/mother.
create or replace view parent_links as
  select c.tree_id, c.person_id as child_id, p.person_id as parent_id, p.role as parent_role, c.event_id
  from event_participants c
  join event_participants p on p.event_id = c.event_id and p.role in ('father','mother')
  where c.role = 'child';
create or replace view spouse_links as
  select h.tree_id, h.person_id as husband_id, w.person_id as wife_id, h.event_id
  from event_participants h
  join event_participants w on w.event_id = h.event_id and w.role = 'wife'
  where h.role = 'husband';
alter view parent_links set (security_invoker = true);
alter view spouse_links set (security_invoker = true);

-- ---------- RLS ----------
alter table trees enable row level security;
alter table tree_members enable row level security;
alter table tree_invites enable row level security;
alter table places enable row level security;
alter table families enable row level security;
alter table sources enable row level security;
alter table persons enable row level security;
alter table event_types enable row level security;
alter table events enable row level security;
alter table event_participants enable row level security;
alter table documents enable row level security;
alter table document_links enable row level security;
alter table photo_tags enable row level security;
alter table source_links enable row level security;
alter table tasks enable row level security;
alter table gedcom_imports enable row level security;
alter table audit_log enable row level security;

create policy trees_read on trees for select using (can_read(id, 0::smallint));
create policy trees_insert on trees for insert with check (owner_id = auth.uid());
create policy trees_update on trees for update using (is_owner(id));
create policy trees_delete on trees for delete using (is_owner(id));

create policy members_read on tree_members for select using (user_id = auth.uid() or is_owner(tree_id));
create policy members_manage on tree_members for all using (is_owner(tree_id)) with check (is_owner(tree_id));
create policy invites_owner on tree_invites for all using (is_owner(tree_id)) with check (is_owner(tree_id));

-- справочники: читают все участники, пишут editor/owner
create policy places_r on places for select using (can_read(tree_id, 0::smallint));
create policy places_w on places for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy families_r on families for select using (can_read(tree_id, 0::smallint));
create policy families_w on families for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy sources_r on sources for select using (can_read(tree_id, 0::smallint));
create policy sources_w on sources for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy etypes_r on event_types for select using (can_read(tree_id, 0::smallint));
create policy etypes_w on event_types for all using (can_write(tree_id)) with check (can_write(tree_id));

-- записи с уровнем конфиденциальности: читатель видит не выше своего max_privacy
create policy persons_r on persons for select using (can_read(tree_id, privacy_level));
create policy persons_w on persons for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy events_r on events for select using (can_read(tree_id, privacy_level));
create policy events_w on events for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy documents_r on documents for select using (can_read(tree_id, privacy_level));
create policy documents_w on documents for all using (can_write(tree_id)) with check (can_write(tree_id));

-- связующие таблицы: читаем, если читаем сам объект (через родителя), пишем как editor/owner
create policy participants_r on event_participants for select using (
  exists (select 1 from events e where e.id = event_id) and exists (select 1 from persons p where p.id = person_id));
create policy participants_w on event_participants for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy doclinks_r on document_links for select using (exists (select 1 from documents d where d.id = document_id));
create policy doclinks_w on document_links for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy phototags_r on photo_tags for select using (
  exists (select 1 from documents d where d.id = document_id) and exists (select 1 from persons p where p.id = person_id));
create policy phototags_w on photo_tags for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy srclinks_r on source_links for select using (can_read(tree_id, 0::smallint));
create policy srclinks_w on source_links for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy tasks_r on tasks for select using (can_write(tree_id));
create policy tasks_w on tasks for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy imports_rw on gedcom_imports for all using (can_write(tree_id)) with check (can_write(tree_id));
create policy audit_r on audit_log for select using (is_owner(tree_id));

-- Storage: бакет 'documents' приватный; путь {tree_id}/{document_id}/{файл}.
-- Политика (в Supabase Dashboard или отдельной миграцией):
--   select: can_read((split_part(name,'/',1))::uuid, 0::smallint)
--   insert/update/delete: can_write((split_part(name,'/',1))::uuid)
-- Пока файл не открыт через signed URL, публичного доступа к фото нет.
