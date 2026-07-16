-- ScreenTime-WorldCup - Esquema de base de datos (Supabase / Postgres)
-- Ejecutar en el SQL editor de Supabase.

create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_name text unique,
  is_eliminated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  log_date date not null,
  screenshot_url text,
  minutes_logged integer,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Migración para bases de datos ya existentes (creadas antes de que
-- team_name fuera unique en el create table de arriba):
-- alter table players add constraint players_team_name_key unique (team_name);

-- Migración: constraint único que impide mas de una captura por jugador/día.
-- alter table daily_logs add constraint daily_logs_player_id_log_date_key unique (player_id, log_date);

-- No hay upsert: /api/upload hace un insert simple y, si ya existe una fila
-- para ese jugador/día, el constraint único la rechaza (23505) y el usuario
-- ve un mensaje pidiendo que un admin borre la captura anterior si hace falta
-- corregirla (ver boton "Eliminar" del Panel de Admin).
