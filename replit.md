# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This project is **Ether Bound Idle** — a full-featured idle MMORPG with a hybrid architecture: fully playable client-side (localStorage) for single player, with a separate Express+PostgreSQL backend for multiplayer.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS v3 (dark sci-fi theme)
- **Data persistence**: localStorage (local mode) or PostgreSQL (server mode)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Build**: esbuild (API server), Vite (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (multiplayer backend)
│   └── game/               # React + Vite frontend (idle MMORPG)
├── lib/
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Architecture

### Hybrid Client (base44Client.js)

The game client supports two modes controlled via `localStorage`:
- **Local mode** (default): All data stored in localStorage. `eb_connection_mode = 'local'`
- **Server mode**: All data via API. `eb_connection_mode = 'server'`, `eb_api_url = '<server base>'`

`base44.getMode()` / `base44.setMode('local'|'server')` to switch at runtime.

Entity CRUD and function calls automatically route to the correct driver. In server mode, entities go to `/api/entities/:name` and functions to `/api/functions/:name`.

### Frontend (artifacts/game)

- **Tailwind v3** with dark sci-fi theme using CSS custom properties (NOT v4)
- Uses `@tailwind base/components/utilities` directives, postcss.config.js, tailwind.config.js
- **Base44 Compatibility Layer**: `src/api/base44Client.js` — 19 entity types (Character, Item, Guild, Quest, Resource, GemLab, etc.) with full CRUD + subscribe. 26+ game functions implemented for both local and remote modes.
- **Auth**: `src/lib/AuthContext.jsx` — localStorage-based identity in local mode, server auth in server mode
- **Life Skills**: Mining, Fishing, Herbalism with 7-tier rarity drop tables, tick-based gathering, speed/luck upgrades, and 4 processing skills (Smelting, Cooking, Alchemy, Forging)
- **Gem Lab**: Uses separate `GemLab` entity store (not `Character.gem_lab`). Auto-creates on first access. Has production/speed/efficiency upgrades with exponential cost scaling (base 1000g, 1.15x multiplier). Legacy `Character.gem_lab` data is auto-migrated.
- **Shop**: 4-hour seeded rotation generating 8 level-scaled equipment items + 2 potions. Uses `buy_price`, `sell_price`, `rarity`, `stats`, `item_level`, `description` fields.
- **Quests**: Daily quests use `target_count`, `current_count`, `rewards` (object), `is_daily`, `objective_type` fields. 8 templates with objectives: combat_kills, gold_earned, level_up, mining, fishing, herbalism. Battle.jsx emits progress events for all objective types.
- **Server-Side Progression**: Combat rewards (XP, gold, leveling, loot, quest progress) are calculated server-side via `fight` function in `base44Client.js` (local) and `functions.ts` (server). Battle.jsx only sends actions and displays results — no client-side reward math. `getPlayer` returns character with idle progress applied. Shared enemy data in `api-server/src/lib/gameData.ts`.
- **Character Storage**: Active character lives in React state + `sessionStorage('activeCharacter')`. Entity store uses `localStorage('eb_Character')`. App.jsx has a `useEffect` that seeds `eb_Character` from sessionStorage on load to prevent desync. The `fight` function also accepts `_fallbackCharacter` param for resilience. Auto-save runs every 10s via `useCharacterAutoSave` hook.
- **Supabase Sync**: `src/lib/supabaseSync.js` — dual-write layer that mirrors localStorage entity operations (create/update/delete) to Supabase for Characters, Items, Quests, Resources. Uses `SUPABASE_URL` + `SUPABASE_ANON_KEY` secrets (exposed to Vite via `define` in vite.config.ts). On character load, `fullSync()` pushes all existing localStorage data to Supabase. Fight function also syncs character updates and loot drops. Supabase client also in API server at `src/lib/supabase.ts`.
- **Game data files**: `src/lib/gameData.js`, `src/lib/equipmentSystem.js`, `src/lib/setSystem.js`, `src/lib/skillData.js`, `src/lib/gameConfig.js`, `src/lib/statSystem.js`
- **Game pages**: Battle, Inventory, Shop, Quests, Dungeons, LifeSkills, GearUpgrading, SkillTree, GuildPage, Social, Dashboard, Leaderboard, Profile, AdminPanel, GameConfig
- **Key libs**: react-router-dom, @tanstack/react-query, framer-motion, recharts, lucide-react, shadcn/ui

### API Server (artifacts/api-server)

- **Auth routes** (`routes/auth.ts`): Replit OIDC login/callback/logout with PKCE, session cookies
- **Entity CRUD** (`routes/entities.ts`): Generic CRUD for 19 game entities with snake_case↔camelCase field mapping
- **Game functions** (`routes/functions.ts`): Full implementations for all game features:
  - **Life Skills**: get_skills, start, stop, tick (with resource drops), upgrade (speed/luck), process (smelting/cooking/alchemy/forging)
  - **Multiplayer**: manageFriends (send/accept/decline/remove/list), getLeaderboard (level/kills/prestige), dungeonAction (enter/attack/flee with floor progression)
  - **Progression**: fight (server-side combat rewards: XP, gold, leveling, quest updates), getPlayer (character with idle progress applied), processServerProgression (idle tick), unifiedPlayerProgression (level-up), catchUpOfflineProgress (offline rewards)
  - **Economy**: sellItem, upgradeItemSafe, starUpgradeItem, awakenItem, getShopRotation, completeTrade, transmuteGold
  - **Social**: manageParty (create/invite/join/leave/disband), manageDailyQuests, updateQuestProgress
  - **Gem Lab**: processGemLab, claimGemLabGems, upgradeGemLab
  - **Admin**: getCurrentUser, getAllUsers, getAllCharacters, updateUserRole, managePlayer, gameConfigManager

### Database (lib/db)

- **Schema** (`schema/game.ts`): 21 tables — characters, items, guilds, quests, trades, parties, party_activities, party_invites, presences, player_sessions, chat_messages, mail, resources, friend_requests, friendships, trade_sessions, dungeon_sessions, gem_labs, private_messages, game_config, user_roles
- **JSONB columns** for flexible game data: equipment, skills, achievements, life_skills, gem_lab, dungeon_data, skill_tree_data
- **Resource table mapping**: `type` column = resource_type (e.g. "iron_ore"), `name` column = rarity (e.g. "common")
- Uses `drizzle-kit push` for dev schema sync

### Life Skills Data Contract

**Drop tables** (7-tier rarity):
- Mining: iron_ore → crystal_ore (common 60% to shiny 0.1%)
- Fishing: carp → golden_fish
- Herbalism: common_herb → spirit_herb
- Luck bonus: +15% rare drop rate per luck level

**Processing recipes** (unlock thresholds):
- Smelting (Mining 30): ore → bar
- Cooking (Fishing 30): fish → food
- Alchemy (Herbalism 30): herb → potion
- Forging (Mining 50): bar → equipment

**Skill data stored in**: `characters.lifeSkills` JSONB (server) or `life_skills` field (client)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Dev Commands

- `pnpm --filter @workspace/game run dev` — run game frontend
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/db run push` — push schema to PostgreSQL
