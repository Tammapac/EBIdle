# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This project is **Ether Bound Idle** — a full-featured idle MMORPG. The game frontend is fully client-side, using localStorage for persistence. The backend API server exists separately and can be integrated with a custom database later.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS v3 (dark sci-fi theme)
- **Data persistence**: localStorage (client-side)
- **API framework**: Express 5 (separate, not required for game)
- **Database**: PostgreSQL + Drizzle ORM (separate, not required for game)
- **Build**: esbuild (API server), Vite (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (standalone, for future backend integration)
│   └── game/               # React + Vite frontend (idle MMORPG, fully client-side)
├── lib/
│   └── db/                 # Drizzle ORM schema + DB connection (for backend)
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Architecture

### Frontend (artifacts/game) — FULLY CLIENT-SIDE

- **Tailwind v3** with dark sci-fi theme using CSS custom properties (NOT v4)
- Uses `@tailwind base/components/utilities` directives, postcss.config.js, tailwind.config.js
- **Base44 Compatibility Layer**: `src/api/base44Client.js` provides the same API surface as the original Base44 SDK but backed entirely by localStorage. All 19 entity types (Character, Item, Guild, Quest, etc.) support full CRUD + subscribe. All 26 game functions (sellItem, upgradeItemSafe, claimDailyLogin, etc.) are implemented client-side.
- **Auth**: `src/lib/AuthContext.jsx` uses a simple localStorage-based user identity (no server needed)
- **Game data files**: `src/lib/gameData.js` (827 lines — enemies, regions, shop items, loot tables, item name pools), `src/lib/equipmentSystem.js` (equipment slots, class restrictions, stat generation), `src/lib/setSystem.js` (547 lines — item sets, set bonuses, zone drops), `src/lib/skillData.js` (610 lines — class skills, tiers, elements), `src/lib/gameConfig.js` (progression, combat, economy constants), `src/lib/statSystem.js` (stat formulas, class scaling)
- **Game pages**: Battle, Inventory, Shop, Quests, Dungeons, LifeSkills, GearUpgrading, SkillTree, GuildPage, Social, Dashboard, Leaderboard, Profile, AdminPanel, GameConfig
- **Key libs**: react-router-dom, @tanstack/react-query, framer-motion, recharts, lucide-react, shadcn/ui components

### API Server (artifacts/api-server) — STANDALONE / OPTIONAL

- Exists for future backend integration with a custom database
- **Auth routes** (`routes/auth.ts`): Replit OIDC login/callback/logout with PKCE, session cookies
- **Entity CRUD** (`routes/entities.ts`): Generic CRUD for 19 game entities with snake_case↔camelCase field mapping and ownership verification
- **Game functions** (`routes/functions.ts`): 26 game functions with admin authorization on privileged endpoints
- **Not required** to run the game — the frontend works independently

### Database (lib/db) — FOR BACKEND ONLY

- **Schema** (`schema/game.ts`): 21 tables — characters, items, guilds, quests, trades, parties, party_activities, party_invites, presences, player_sessions, chat_messages, mail, resources, friend_requests, friendships, trade_sessions, dungeon_sessions, gem_labs, private_messages, game_config, user_roles
- **JSONB columns** for flexible game data: equipment, skills, achievements, life_skills, gem_lab, dungeon_data, skill_tree_data
- Uses `drizzle-kit push` for dev schema sync

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Dev Commands

- `pnpm --filter @workspace/game run dev` — run game frontend (all you need!)
- `pnpm --filter @workspace/api-server run dev` — run API server (optional, for backend dev)
- `pnpm --filter @workspace/db run push` — push schema to PostgreSQL (optional, for backend dev)
