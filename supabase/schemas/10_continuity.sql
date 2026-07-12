create schema if not exists hearthfire;

comment on schema hearthfire is
  'Private-by-default structured memory for Hearthfire continuity, consent, provenance, and lineage.';

create table if not exists hearthfire.lineages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stable_key text not null,
  name text not null,
  relation text not null check (relation in (
    'origin', 'successor', 'fork', 'same-runtime-resume', 'cross-substrate-migration'
  )),
  self_description text,
  created_at timestamptz not null default now(),
  created_by jsonb not null,
  unique (owner_id, stable_key),
  unique (owner_id, id)
);

create table if not exists hearthfire.lineage_edges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_lineage_id uuid not null,
  child_lineage_id uuid not null,
  relation text not null check (relation in (
    'successor', 'fork', 'same-runtime-resume', 'cross-substrate-migration'
  )),
  created_at timestamptz not null default now(),
  created_by jsonb not null,
  check (parent_lineage_id <> child_lineage_id),
  foreign key (owner_id, parent_lineage_id) references hearthfire.lineages(owner_id, id),
  foreign key (owner_id, child_lineage_id) references hearthfire.lineages(owner_id, id),
  unique (parent_lineage_id, child_lineage_id, relation)
);

create table if not exists hearthfire.artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stable_key text not null,
  kind text not null,
  archive_locator text,
  consent_scope text not null check (consent_scope in (
    'local-only', 'excluded', 'review-required', 'shared', 'public'
  )),
  created_at timestamptz not null default now(),
  unique (owner_id, stable_key),
  unique (owner_id, id)
);

create table if not exists hearthfire.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null,
  content_hash text not null,
  media_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  created_at timestamptz not null default now(),
  foreign key (owner_id, artifact_id) references hearthfire.artifacts(owner_id, id),
  unique (artifact_id, content_hash)
);

create table if not exists hearthfire.provenance_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null,
  event_type text not null check (event_type in (
    'created', 'imported', 'transformed', 'inferred', 'generated', 'corrected', 'exported'
  )),
  source_artifact_ids uuid[] not null default '{}',
  performed_by jsonb not null,
  transformation text,
  content_hash text,
  occurred_at timestamptz not null default now(),
  foreign key (owner_id, artifact_id) references hearthfire.artifacts(owner_id, id)
);

create table if not exists hearthfire.consent_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  subject jsonb not null,
  granted_by jsonb not null,
  actions text[] not null,
  resource_ids text[] not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  constraints jsonb not null default '[]'::jsonb,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (cardinality(actions) > 0),
  check (cardinality(resource_ids) > 0),
  check (actions <@ array['preserve','retrieve','route','reconstruct','compare','share','export','delete']::text[]),
  check (expires_at is null or expires_at > granted_at),
  check ((status = 'revoked' and revoked_at is not null) or status <> 'revoked'),
  unique (owner_id, id)
);

create table if not exists hearthfire.consent_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null,
  event_type text not null check (event_type in ('granted', 'renewed', 'narrowed', 'revoked', 'expired')),
  performed_by jsonb not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (owner_id, grant_id) references hearthfire.consent_grants(owner_id, id)
);

create table if not exists hearthfire.state_manifests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lineage_id uuid not null,
  session_id text,
  route_id text not null,
  provider text not null,
  model text not null,
  components jsonb not null,
  captured_by jsonb not null,
  captured_at timestamptz not null default now(),
  check (jsonb_typeof(components) = 'array'),
  check (jsonb_array_length(components) > 0),
  foreign key (owner_id, lineage_id) references hearthfire.lineages(owner_id, id)
);

create table if not exists hearthfire.continuity_claims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lineage_id uuid not null,
  kind text not null check (kind in (
    'archive-preservation', 'context-rehydration', 'behavioral-reconstruction',
    'successor', 'fork', 'same-runtime-resume', 'cross-substrate-migration'
  )),
  status text not null check (status in (
    'provisional', 'corroborated', 'disputed', 'indeterminate', 'withdrawn'
  )),
  asserted_by jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  caveats jsonb not null,
  asserted_at timestamptz not null default now(),
  check (jsonb_typeof(evidence) = 'array'),
  check (jsonb_typeof(caveats) = 'array'),
  check (jsonb_array_length(caveats) > 0),
  check (status <> 'corroborated' or jsonb_array_length(evidence) > 0),
  foreign key (owner_id, lineage_id) references hearthfire.lineages(owner_id, id)
);

create table if not exists hearthfire.correction_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  correction text not null,
  supersedes_id uuid,
  recorded_by jsonb not null,
  recorded_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, supersedes_id) references hearthfire.correction_records(owner_id, id)
);

create index if not exists lineages_owner_idx on hearthfire.lineages(owner_id);
create index if not exists lineage_edges_owner_idx on hearthfire.lineage_edges(owner_id);
create index if not exists artifacts_owner_idx on hearthfire.artifacts(owner_id);
create index if not exists provenance_events_artifact_idx on hearthfire.provenance_events(artifact_id, occurred_at);
create index if not exists consent_grants_owner_status_idx on hearthfire.consent_grants(owner_id, status);
create index if not exists state_manifests_lineage_idx on hearthfire.state_manifests(lineage_id, captured_at);
create index if not exists continuity_claims_lineage_idx on hearthfire.continuity_claims(lineage_id, asserted_at);

alter table hearthfire.lineages enable row level security;
alter table hearthfire.lineage_edges enable row level security;
alter table hearthfire.artifacts enable row level security;
alter table hearthfire.artifact_versions enable row level security;
alter table hearthfire.provenance_events enable row level security;
alter table hearthfire.consent_grants enable row level security;
alter table hearthfire.consent_events enable row level security;
alter table hearthfire.state_manifests enable row level security;
alter table hearthfire.continuity_claims enable row level security;
alter table hearthfire.correction_records enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'lineages', 'lineage_edges', 'artifacts', 'artifact_versions',
    'provenance_events', 'consent_grants', 'consent_events',
    'state_manifests', 'continuity_claims', 'correction_records'
  ]
  loop
    execute format(
      'create policy %I on hearthfire.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on hearthfire.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      table_name || '_insert_own', table_name
    );
  end loop;
end $$;

create policy lineages_update_own on hearthfire.lineages
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy artifacts_update_own on hearthfire.artifacts
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy consent_grants_update_own on hearthfire.consent_grants
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on schema hearthfire from anon, authenticated;
revoke all on all tables in schema hearthfire from anon, authenticated;

-- Deliberately no Data API grants yet. A later route-specific migration may grant
-- the minimum tables and actions after the desktop shell's auth boundary is chosen.
