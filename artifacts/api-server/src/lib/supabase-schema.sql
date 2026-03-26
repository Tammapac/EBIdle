-- Ether Bound Idle — Full Supabase Schema
-- Generated from Drizzle schema (lib/db/src/schema/)

-- ============ AUTH TABLES ============

CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar UNIQUE,
  first_name varchar,
  last_name varchar,
  profile_image_url varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  sid varchar PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- ============ GAME TABLES ============

CREATE TABLE IF NOT EXISTS characters (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by varchar NOT NULL REFERENCES users(id),
  name varchar NOT NULL,
  class varchar NOT NULL,
  level integer NOT NULL DEFAULT 1,
  exp integer NOT NULL DEFAULT 0,
  exp_to_next integer NOT NULL DEFAULT 100,
  hp integer NOT NULL DEFAULT 100,
  max_hp integer NOT NULL DEFAULT 100,
  mp integer NOT NULL DEFAULT 50,
  max_mp integer NOT NULL DEFAULT 50,
  strength integer NOT NULL DEFAULT 10,
  dexterity integer NOT NULL DEFAULT 10,
  intelligence integer NOT NULL DEFAULT 10,
  vitality integer NOT NULL DEFAULT 10,
  luck integer NOT NULL DEFAULT 5,
  stat_points integer NOT NULL DEFAULT 0,
  skill_points integer NOT NULL DEFAULT 0,
  gold integer NOT NULL DEFAULT 100,
  gems integer NOT NULL DEFAULT 10,
  current_region varchar NOT NULL DEFAULT 'verdant_forest',
  equipment jsonb NOT NULL DEFAULT '{}',
  skills jsonb NOT NULL DEFAULT '[]',
  hotbar_skills jsonb NOT NULL DEFAULT '[]',
  idle_mode boolean NOT NULL DEFAULT false,
  total_kills integer NOT NULL DEFAULT 0,
  total_damage integer NOT NULL DEFAULT 0,
  prestige_level integer NOT NULL DEFAULT 0,
  achievements jsonb NOT NULL DEFAULT '[]',
  daily_quests_completed integer NOT NULL DEFAULT 0,
  weekly_quests_completed integer NOT NULL DEFAULT 0,
  last_idle_claim timestamptz DEFAULT now(),
  guild_id varchar,
  is_banned boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  title varchar,
  life_skills jsonb DEFAULT '{}',
  gem_lab jsonb DEFAULT '{}',
  daily_login_streak integer NOT NULL DEFAULT 0,
  last_daily_login timestamptz,
  dungeon_data jsonb DEFAULT '{}',
  skill_tree_data jsonb DEFAULT '{}',
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_characters_created_by ON characters (created_by);
CREATE INDEX IF NOT EXISTS idx_characters_guild_id ON characters (guild_id);

CREATE TABLE IF NOT EXISTS items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id varchar NOT NULL REFERENCES characters(id),
  name varchar NOT NULL,
  type varchar NOT NULL,
  rarity varchar NOT NULL DEFAULT 'common',
  level integer NOT NULL DEFAULT 1,
  equipped boolean NOT NULL DEFAULT false,
  stats jsonb DEFAULT '{}',
  set_id varchar,
  upgrade_level integer NOT NULL DEFAULT 0,
  star_level integer NOT NULL DEFAULT 0,
  awakened boolean NOT NULL DEFAULT false,
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_owner_id ON items (owner_id);

CREATE TABLE IF NOT EXISTS guilds (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL UNIQUE,
  description text,
  leader_id varchar NOT NULL,
  leader_name varchar,
  members jsonb NOT NULL DEFAULT '[]',
  member_count integer NOT NULL DEFAULT 1,
  level integer NOT NULL DEFAULT 1,
  exp integer NOT NULL DEFAULT 0,
  guild_tokens integer NOT NULL DEFAULT 0,
  perks jsonb DEFAULT '{}',
  buffs jsonb DEFAULT '{}',
  buildings jsonb DEFAULT '{}',
  boss_active boolean NOT NULL DEFAULT false,
  boss_name varchar,
  boss_hp integer,
  boss_max_hp integer,
  boss_expires_at timestamptz,
  shop_items jsonb DEFAULT '[]',
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id varchar NOT NULL REFERENCES characters(id),
  type varchar NOT NULL,
  title varchar NOT NULL,
  description text,
  objective jsonb DEFAULT '{}',
  progress integer NOT NULL DEFAULT 0,
  target integer NOT NULL DEFAULT 1,
  reward jsonb DEFAULT '{}',
  status varchar NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quests_character_id ON quests (character_id);

CREATE TABLE IF NOT EXISTS trades (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  from_character_id varchar NOT NULL,
  from_character_name varchar,
  to_character_id varchar,
  to_character_name varchar,
  offered_items jsonb DEFAULT '[]',
  requested_gold integer NOT NULL DEFAULT 0,
  offered_gold integer NOT NULL DEFAULT 0,
  status varchar NOT NULL DEFAULT 'pending',
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parties (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id varchar NOT NULL,
  leader_name varchar,
  members jsonb NOT NULL DEFAULT '[]',
  max_members integer NOT NULL DEFAULT 4,
  status varchar NOT NULL DEFAULT 'open',
  region varchar,
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS party_activities (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id varchar,
  character_id varchar,
  character_name varchar,
  type varchar NOT NULL,
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS party_invites (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id varchar NOT NULL,
  from_character_id varchar NOT NULL,
  from_character_name varchar,
  to_character_id varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_invites_to ON party_invites (to_character_id);

CREATE TABLE IF NOT EXISTS presences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id varchar NOT NULL UNIQUE,
  character_name varchar,
  status varchar NOT NULL DEFAULT 'online',
  current_zone varchar,
  last_seen timestamptz NOT NULL DEFAULT now(),
  extra_data jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS player_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id varchar NOT NULL,
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_sessions_character_id ON player_sessions (character_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  channel varchar NOT NULL DEFAULT 'global',
  sender_id varchar NOT NULL,
  sender_name varchar,
  message text NOT NULL,
  type varchar NOT NULL DEFAULT 'chat',
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  from_character_id varchar,
  from_character_name varchar,
  to_character_id varchar NOT NULL,
  subject varchar,
  body text,
  attachments jsonb DEFAULT '[]',
  read boolean NOT NULL DEFAULT false,
  claimed boolean NOT NULL DEFAULT false,
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mail_to ON mail (to_character_id);

CREATE TABLE IF NOT EXISTS resources (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id varchar NOT NULL,
  type varchar NOT NULL,
  name varchar NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  extra_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resources_character_id ON resources (character_id);

CREATE TABLE IF NOT EXISTS game_config (
  id varchar PRIMARY KEY DEFAULT 'global',
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_character_id varchar,
  to_character_id varchar,
  status varchar DEFAULT 'pending',
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests (from_character_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests (to_character_id);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id_1 varchar,
  character_id_2 varchar,
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id varchar,
  receiver_id varchar,
  status varchar DEFAULT 'pending',
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_initiator ON trade_sessions (initiator_id);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_receiver ON trade_sessions (receiver_id);

CREATE TABLE IF NOT EXISTS dungeon_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id varchar,
  dungeon_id varchar,
  status varchar DEFAULT 'active',
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dungeon_sessions_character ON dungeon_sessions (character_id);

CREATE TABLE IF NOT EXISTS gem_labs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id varchar,
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gem_labs_character ON gem_labs (character_id);

CREATE TABLE IF NOT EXISTS private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_character_id varchar,
  to_character_id varchar,
  message text,
  data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_private_messages_from ON private_messages (from_character_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_to ON private_messages (to_character_id);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id varchar PRIMARY KEY REFERENCES users(id),
  role varchar NOT NULL DEFAULT 'player',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS POLICIES ============
-- Allow anon key full access for game operations

DO $$ 
DECLARE t text;
BEGIN
  FOR t IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'users','characters','items','guilds','quests','trades',
      'parties','party_activities','party_invites','presences',
      'player_sessions','chat_messages','mail','resources',
      'game_config','friend_requests','friendships','trade_sessions',
      'dungeon_sessions','gem_labs','private_messages','user_roles','sessions'
    )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_anon_all ON %I', t);
    EXECUTE format('CREATE POLICY allow_anon_all ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
