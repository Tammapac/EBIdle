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
- **Life Skills**: Mining, Fishing, Herbalism with 7-tier rarity drop tables, tick-based gathering, speed/XP boost upgrades (XP boost: +10% XP gain per level), and 4 processing skills (Smelting, Cooking, Alchemy, Forging)
- **Gem Lab**: Uses separate `GemLab` entity store (not `Character.gem_lab`). Auto-creates on first access. Has production/speed/efficiency upgrades with exponential cost scaling (base 1000g, 1.15x multiplier). Legacy `Character.gem_lab` data is auto-migrated. Cycle-based production: gems per cycle = 0.001 * prodMult * effMult, cycle time = (10/speedMult) minutes. Idle engine ticks every 30s, only advances `last_collection_time` by completed cycles (preserves partial progress). Progress bar uses modulo of elapsed time vs cycle length for accurate visual.
- **Shop**: 4-hour random rotation generating 8 level-scaled equipment items + 2 potions. Items cached in localStorage (`eb_shop_cache_{charId}`) with expiry timestamp. Manual refresh costs 5 gems (only when timer hasn't expired). Timer auto-resets to 4 hours with new random items when it hits 0. Uses `buy_price`, `sell_price`, `rarity`, `stats`, `item_level`, `description` fields.
- **Quests**: Daily quests use `target_count`, `current_count`, `rewards` (object), `is_daily`, `objective_type` fields. 8 templates with objectives: combat_kills, gold_earned, level_up, mining, fishing, herbalism. Battle.jsx emits progress events for all objective types.
- **Server-Side Progression**: Combat rewards (XP, gold, leveling, loot, quest progress) are calculated server-side via `fight` function in `base44Client.js` (local) and `functions.ts` (server). Battle.jsx only sends actions and displays results — no client-side reward math. `getPlayer` returns character with idle progress applied. Shared enemy data in `api-server/src/lib/gameData.ts`.
- **Character Storage**: Active character lives in React state + `sessionStorage('activeCharacter')`. Entity store uses `localStorage('eb_Character')`. App.jsx has a `useEffect` that seeds `eb_Character` from sessionStorage on load to prevent desync. The `fight` function also accepts `_fallbackCharacter` param for resilience. Auto-save runs every 10s via `useCharacterAutoSave` hook.
- **Supabase Sync**: `src/lib/supabaseSync.js` — dual-write layer that mirrors localStorage entity operations (create/update/delete) to Supabase for Characters, Items, Quests, Resources, GemLabs. Uses `SUPABASE_URL` + `SUPABASE_ANON_KEY` secrets (exposed to Vite via `define` in vite.config.ts). On character load, `fullSync()` pushes all existing localStorage data to Supabase. Also stores authoritative timestamps (`storeTimestamp/getTimestamp/validateElapsed`) in `game_config` table to prevent manipulation. Supabase client also in API server at `src/lib/supabase.ts`.
- **Supabase Multiplayer**: When Supabase is enabled, the **Leaderboard** reads all player characters directly from Supabase (not localStorage), and the **Party system** operates entirely via Supabase tables (`parties`, `party_invites`). Party operations (create, invite by name, accept, decline, leave) all go through Supabase directly from the client. Member details (level, zone) are fetched from the Supabase `characters` table. The schema includes RLS policies allowing full anon access for all game tables. `handleCharacterUpdate` in App.jsx syncs character state to Supabase on every update.
- **Idle Engine**: `src/lib/idleEngine.js` — singleton that runs all game systems in parallel background loops regardless of which page is active. Systems: auto-fight (4s, paused when Battle.jsx is open), life skill ticks (20s), gem lab processing (30s), shop rotation countdown (60s), guild boss cooldown tracking (30s), auto-save to Supabase (15s). Starts when character loads via App.jsx, stops on logout. Emits events (`fightResult`, `lifeSkillTick`, `gemLabTick`, `shopRotation`, `guildBossStatus`) for UI components. `IdleStatusBar.jsx` in GameLayout shows real-time status of all systems.
- **Gear Upgrading**: Safe upgrade costs `300 * (level+1) * rarityMult` gold, +5% stats per level (max 20). Star upgrade costs `ceil(5 * 1.5^star * rarityMult)` gems, +15% stats per star, failure DELETES item (max 7). Awakening costs 50 gems (requires ⭐7), +50% stats.
- **Death Penalty**: On player death, lose 10% current EXP and 3% current gold (clamped at 0). Persisted immediately via saveMutation. Shown in battle log.
- **Empowered Enemies**: ~8% chance to spawn an empowered version of any normal zone enemy (3x HP, 1.5x damage, 3x EXP/gold rewards, better loot drop rates). Shown with lightning bolt prefix. Separate from named zone elites (1.5% each for eliteEnemy/eliteEnemy2).
- **Class-Restricted Helmets**: Helmets now have weight subtypes (plate_helm for Warrior, leather_helm for Ranger, cloth_helm for Mage/Rogue) matching the armor weight system. ITEM_NAMES has per-zone helmet pools keyed by subtype. Legacy helmets without subtype remain universal.
- **Party Bonuses**: +5% EXP and +10% Gold per additional party member (in same zone). Both bonuses shown in battle log after defeating an enemy. PartyPanel UI displays both bonus percentages.
- **Stat Scaling (low-power balanced)**: Evasion caps at 25% (soft 12%), Block caps at 30%, Crit caps at 30% (soft 18%), Crit DMG caps at 160% (base 115%), Attack Speed caps at 1.8x, Defense uses def/(def+200) curve. Rarity multipliers: common 1.0→shiny 6.0. Item level scaling 0.07 per level. Percentage stats (crit/evasion/block/etc) have 0.35x reduction on gear. Damage scaling multipliers: warrior 1.3x STR, mage 1.4x INT, ranger/rogue 1.2x DEX.
- **Superadmin/DEV**: roleSystem shows "DEV" title in yellow-400 for superadmin role. GameConfig page gives full parameter editing.
- **Guild Boss Attack Limit**: 10 attacks per 8-hour window (no per-attack cooldown). Tracked in localStorage (`eb_guild_boss_attacks_{charId}`) and validated server-side via Supabase `game_config` table (`guild_boss_attack_window` key storing window start + count). Tokens only awarded when boss is defeated (`newHp <= 0`), not per-attack. GuildBoss.jsx shows attacks remaining and window reset timer.
- **Guild Perks & Base Upgrades**: Both use 500 token base cost with 1.5x exponential scaling per level (`Math.floor(500 * 1.5^level)`). Max level 10. Perks: EXP/Gold/Damage/Idle boosts. Buildings: Forge/Academy/Treasury.
- **Admin Panel**: Three tabs — Manage (users + characters with ban/mute/kick/delete/edit stats), Guilds (list all guilds with member details, kick members, delete guilds — superadmin only), Server Players (Supabase query, auto-refresh 30s).
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
