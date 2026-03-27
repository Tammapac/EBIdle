import { ENEMIES as GAME_ENEMIES, REGIONS as GAME_REGIONS, generateLoot as gameLootGen, calculateExpToLevel as calcExpToLevel } from '@/lib/gameData';
import { supabaseSync } from '@/lib/supabaseSync';

const MODE_KEY = 'eb_connection_mode';
const API_URL_KEY = 'eb_api_url';
const DEFAULT_API_URL = 'http://46.224.121.242:3000';

function getMode() {
  try { return localStorage.getItem(MODE_KEY) || 'server'; } catch { return 'server'; }
}

function setMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
}

function getApiUrl() {
  try { return localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL; } catch { return DEFAULT_API_URL; }
}

function setApiUrl(url) {
  try { localStorage.setItem(API_URL_KEY, url); } catch {}
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const subscribers = {};

function notifySubscribers(entityName, event) {
  const subs = subscribers[entityName];
  if (!subs) return;
  for (const cb of subs) {
    try { cb(event); } catch {}
  }
}

function getStore(entityName) {
  const key = `eb_${entityName}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStore(entityName, data) {
  const key = `eb_${entityName}`;
  localStorage.setItem(key, JSON.stringify(data));
}

function matchesFilter(record, filter) {
  for (const [key, value] of Object.entries(filter)) {
    const recordVal = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('$in' in value) {
        if (!value.$in.includes(recordVal)) return false;
      }
      if ('$ne' in value) {
        if (recordVal === value.$ne) return false;
      }
      if ('$gt' in value) {
        if (!(recordVal > value.$gt)) return false;
      }
      if ('$lt' in value) {
        if (!(recordVal < value.$lt)) return false;
      }
      if ('$gte' in value) {
        if (!(recordVal >= value.$gte)) return false;
      }
      if ('$lte' in value) {
        if (!(recordVal <= value.$lte)) return false;
      }
    } else {
      if (recordVal !== value) return false;
    }
  }
  return true;
}

function applySortAndLimit(records, sort, limit) {
  if (sort) {
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    records.sort((a, b) => {
      const av = a[camel] ?? a[field] ?? '';
      const bv = b[camel] ?? b[field] ?? '';
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }
  if (limit) records = records.slice(0, Number(limit));
  return records;
}

function createLocalEntityProxy(entityName) {
  return {
    async create(data) {
      const records = getStore(entityName);
      const now = new Date().toISOString();
      const record = {
        id: generateId(),
        ...data,
        created_date: now,
        updated_date: now,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      setStore(entityName, records);
      notifySubscribers(entityName, { type: 'create', id: record.id, data: record });
      if (supabaseSync.isEnabled()) {
        if (entityName === 'Character') supabaseSync.syncCharacter(record).catch(() => {});
        else if (entityName === 'Item') supabaseSync.syncItem(record).catch(() => {});
        else if (entityName === 'Quest') supabaseSync.syncQuest(record).catch(() => {});
        else if (entityName === 'Resource') supabaseSync.syncResource(record).catch(() => {});
      }
      return record;
    },

    async get(id) {
      const records = getStore(entityName);
      const record = records.find(r => r.id === id);
      if (!record) throw new Error(`${entityName} not found: ${id}`);
      return record;
    },

    async filter(query = {}, sort, limit) {
      let records = getStore(entityName);
      if (query && Object.keys(query).length) {
        records = records.filter(r => matchesFilter(r, query));
      }
      return applySortAndLimit([...records], sort, limit);
    },

    async list(sort, limit) {
      const records = getStore(entityName);
      return applySortAndLimit([...records], sort, limit);
    },

    async update(id, data) {
      const records = getStore(entityName);
      const idx = records.findIndex(r => r.id === id);
      if (idx === -1) throw new Error(`${entityName} not found: ${id}`);
      const now = new Date().toISOString();
      records[idx] = { ...records[idx], ...data, updated_date: now, updatedAt: now };
      setStore(entityName, records);
      notifySubscribers(entityName, { type: 'update', id, data: records[idx] });
      if (supabaseSync.isEnabled()) {
        if (entityName === 'Character') supabaseSync.syncCharacter(records[idx]).catch(() => {});
        else if (entityName === 'Item') supabaseSync.syncItem(records[idx]).catch(() => {});
        else if (entityName === 'Quest') supabaseSync.syncQuest(records[idx]).catch(() => {});
        else if (entityName === 'Resource') supabaseSync.syncResource(records[idx]).catch(() => {});
      }
      return records[idx];
    },

    async delete(id) {
      let records = getStore(entityName);
      records = records.filter(r => r.id !== id);
      setStore(entityName, records);
      notifySubscribers(entityName, { type: 'delete', id });
      if (supabaseSync.isEnabled()) {
        if (entityName === 'Item') supabaseSync.deleteItem(id).catch(() => {});
      }
      return { success: true };
    },

    subscribe(callback) {
      if (!subscribers[entityName]) subscribers[entityName] = new Set();
      subscribers[entityName].add(callback);

      let active = true;
      let timeout;
      const poll = () => {
        if (!active) return;
        try { callback({ type: 'poll' }); } catch {}
        timeout = setTimeout(poll, 30000);
      };
      timeout = setTimeout(poll, 30000);

      return () => {
        active = false;
        if (timeout) clearTimeout(timeout);
        subscribers[entityName]?.delete(callback);
      };
    },
  };
}

async function apiFetch(path, options = {}) {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}/api${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

function createRemoteEntityProxy(entityName) {
  return {
    async create(data) {
      return apiFetch(`/entities/${entityName}`, { method: 'POST', body: JSON.stringify(data) });
    },
    async get(id) {
      return apiFetch(`/entities/${entityName}/${id}`);
    },
    async filter(query = {}, sort, limit) {
      const params = new URLSearchParams();
      if (query && Object.keys(query).length) params.set('filter', JSON.stringify(query));
      if (sort) params.set('sort', sort);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return apiFetch(`/entities/${entityName}${qs ? '?' + qs : ''}`);
    },
    async list(sort, limit) {
      return this.filter({}, sort, limit);
    },
    async update(id, data) {
      return apiFetch(`/entities/${entityName}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    async delete(id) {
      return apiFetch(`/entities/${entityName}/${id}`, { method: 'DELETE' });
    },
    subscribe(callback) {
      if (!subscribers[entityName]) subscribers[entityName] = new Set();
      subscribers[entityName].add(callback);
      let active = true;
      let timeout;
      const poll = () => {
        if (!active) return;
        try { callback({ type: 'poll' }); } catch {}
        timeout = setTimeout(poll, 15000);
      };
      timeout = setTimeout(poll, 15000);
      return () => {
        active = false;
        if (timeout) clearTimeout(timeout);
        subscribers[entityName]?.delete(callback);
      };
    },
  };
}

const entityNames = [
  'Character', 'Item', 'Guild', 'Quest', 'Trade',
  'Party', 'PartyActivity', 'PartyInvite', 'Presence',
  'PlayerSession', 'ChatMessage', 'Mail', 'Resource',
  'FriendRequest', 'Friendship', 'TradeSession',
  'DungeonSession', 'GemLab', 'PrivateMessage',
];

const localProxies = {};
const remoteProxies = {};
entityNames.forEach(name => {
  localProxies[name] = createLocalEntityProxy(name);
  remoteProxies[name] = createRemoteEntityProxy(name);
});

function createHybridEntityProxy(entityName) {
  const methods = ['create', 'get', 'filter', 'list', 'update', 'delete', 'subscribe'];
  const proxy = {};
  methods.forEach(method => {
    proxy[method] = (...args) => {
      const driver = getMode() === 'server' ? remoteProxies[entityName] : localProxies[entityName];
      return driver[method](...args);
    };
  });
  return proxy;
}

const entities = {};
entityNames.forEach(name => {
  entities[name] = createHybridEntityProxy(name);
});

function getLocalUser() {
  try {
    const raw = localStorage.getItem('eb_local_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const LIFE_SKILL_DROPS = {
  mining: [
    { resource: 'iron_ore', label: 'Iron Ore', rarity: 'common', weight: 60 },
    { resource: 'copper_ore', label: 'Copper Ore', rarity: 'uncommon', weight: 25 },
    { resource: 'silver_ore', label: 'Silver Ore', rarity: 'rare', weight: 10 },
    { resource: 'gold_ore', label: 'Gold Ore', rarity: 'epic', weight: 3.5 },
    { resource: 'platinum_ore', label: 'Platinum Ore', rarity: 'legendary', weight: 1 },
    { resource: 'void_ore', label: 'Void Ore', rarity: 'mythic', weight: 0.4 },
    { resource: 'crystal_ore', label: 'Crystal Ore', rarity: 'shiny', weight: 0.1 },
  ],
  fishing: [
    { resource: 'carp', label: 'Carp', rarity: 'common', weight: 60 },
    { resource: 'salmon', label: 'Salmon', rarity: 'uncommon', weight: 25 },
    { resource: 'tuna', label: 'Tuna', rarity: 'rare', weight: 10 },
    { resource: 'swordfish', label: 'Swordfish', rarity: 'epic', weight: 3.5 },
    { resource: 'dragonfish', label: 'Dragonfish', rarity: 'legendary', weight: 1 },
    { resource: 'leviathan_fish', label: 'Leviathan Fish', rarity: 'mythic', weight: 0.4 },
    { resource: 'golden_fish', label: 'Golden Fish', rarity: 'shiny', weight: 0.1 },
  ],
  herbalism: [
    { resource: 'common_herb', label: 'Common Herb', rarity: 'common', weight: 60 },
    { resource: 'greenleaf', label: 'Greenleaf', rarity: 'uncommon', weight: 25 },
    { resource: 'blue_herb', label: 'Blue Herb', rarity: 'rare', weight: 10 },
    { resource: 'shadow_herb', label: 'Shadow Herb', rarity: 'epic', weight: 3.5 },
    { resource: 'sun_blossom', label: 'Sun Blossom', rarity: 'legendary', weight: 1 },
    { resource: 'ether_plant', label: 'Ether Plant', rarity: 'mythic', weight: 0.4 },
    { resource: 'spirit_herb', label: 'Spirit Herb', rarity: 'shiny', weight: 0.1 },
  ],
};

const PROCESSING_RECIPES = {
  smelting: {
    icon: '🔥', label: 'Smelting', description: 'Smelt ores into bars',
    requires_skill: 'mining', requires_level: 30,
    recipes: [
      { input: 'iron_ore', input_label: 'Iron Ore', output: 'iron_bar', output_label: 'Iron Bar', rarity: 'common' },
      { input: 'copper_ore', input_label: 'Copper Ore', output: 'copper_bar', output_label: 'Copper Bar', rarity: 'uncommon' },
      { input: 'silver_ore', input_label: 'Silver Ore', output: 'silver_bar', output_label: 'Silver Bar', rarity: 'rare' },
      { input: 'gold_ore', input_label: 'Gold Ore', output: 'gold_bar', output_label: 'Gold Bar', rarity: 'epic' },
      { input: 'platinum_ore', input_label: 'Platinum Ore', output: 'platinum_bar', output_label: 'Platinum Bar', rarity: 'legendary' },
      { input: 'void_ore', input_label: 'Void Ore', output: 'void_bar', output_label: 'Void Bar', rarity: 'mythic' },
      { input: 'crystal_ore', input_label: 'Crystal Ore', output: 'crystal_bar', output_label: 'Crystal Bar', rarity: 'shiny' },
    ],
  },
  cooking: {
    icon: '🍳', label: 'Cooking', description: 'Cook fish into food',
    requires_skill: 'fishing', requires_level: 30,
    recipes: [
      { input: 'carp', input_label: 'Carp', output: 'grilled_carp', output_label: 'Grilled Carp', rarity: 'common' },
      { input: 'salmon', input_label: 'Salmon', output: 'salmon_steak', output_label: 'Salmon Steak', rarity: 'uncommon' },
      { input: 'tuna', input_label: 'Tuna', output: 'tuna_soup', output_label: 'Tuna Soup', rarity: 'rare' },
      { input: 'swordfish', input_label: 'Swordfish', output: 'swordfish_feast', output_label: 'Swordfish Feast', rarity: 'epic' },
      { input: 'dragonfish', input_label: 'Dragonfish', output: 'dragon_broth', output_label: 'Dragon Broth', rarity: 'legendary' },
      { input: 'leviathan_fish', input_label: 'Leviathan Fish', output: 'leviathan_stew', output_label: 'Leviathan Stew', rarity: 'mythic' },
      { input: 'golden_fish', input_label: 'Golden Fish', output: 'golden_banquet', output_label: 'Golden Banquet', rarity: 'shiny' },
    ],
  },
  alchemy: {
    icon: '⚗️', label: 'Alchemy', description: 'Brew herbs into potions',
    requires_skill: 'herbalism', requires_level: 30,
    recipes: [
      { input: 'common_herb', input_label: 'Common Herb', output: 'healing_salve', output_label: 'Healing Salve', rarity: 'common' },
      { input: 'greenleaf', input_label: 'Greenleaf', output: 'mana_elixir', output_label: 'Mana Elixir', rarity: 'uncommon' },
      { input: 'blue_herb', input_label: 'Blue Herb', output: 'strength_brew', output_label: 'Strength Brew', rarity: 'rare' },
      { input: 'shadow_herb', input_label: 'Shadow Herb', output: 'sun_tincture', output_label: 'Sun Tincture', rarity: 'epic' },
      { input: 'sun_blossom', input_label: 'Sun Blossom', output: 'ether_draught', output_label: 'Ether Draught', rarity: 'legendary' },
      { input: 'ether_plant', input_label: 'Ether Plant', output: 'spirit_essence', output_label: 'Spirit Essence', rarity: 'mythic' },
      { input: 'spirit_herb', input_label: 'Spirit Herb', output: 'minor_potion', output_label: 'Minor Potion', rarity: 'shiny' },
    ],
  },
  forging: {
    icon: '⚔️', label: 'Forging', description: 'Forge bars into equipment',
    requires_skill: 'mining', requires_level: 50,
    recipes: [
      { input: 'iron_bar', input_label: 'Iron Bar', output: 'iron_sword', output_label: 'Iron Sword', rarity: 'common' },
      { input: 'copper_bar', input_label: 'Copper Bar', output: 'steel_armor', output_label: 'Steel Armor', rarity: 'uncommon' },
      { input: 'silver_bar', input_label: 'Silver Bar', output: 'silver_blade', output_label: 'Silver Blade', rarity: 'rare' },
      { input: 'gold_bar', input_label: 'Gold Bar', output: 'gold_shield', output_label: 'Gold Shield', rarity: 'epic' },
      { input: 'platinum_bar', input_label: 'Platinum Bar', output: 'platinum_helm', output_label: 'Platinum Helm', rarity: 'legendary' },
      { input: 'void_bar', input_label: 'Void Bar', output: 'void_weapon', output_label: 'Void Weapon', rarity: 'mythic' },
      { input: 'crystal_bar', input_label: 'Crystal Bar', output: 'crystal_relic', output_label: 'Crystal Relic', rarity: 'shiny' },
    ],
  },
};

const SKILL_TYPES = ['mining', 'fishing', 'herbalism'];

function rollDrop(dropTable, luckBonus) {
  const totalWeight = dropTable.reduce((sum, d) => sum + d.weight * (d.rarity !== 'common' ? luckBonus : 1), 0);
  let roll = Math.random() * totalWeight;
  for (const drop of dropTable) {
    const adjustedWeight = drop.weight * (drop.rarity !== 'common' ? luckBonus : 1);
    roll -= adjustedWeight;
    if (roll <= 0) return drop;
  }
  return dropTable[0];
}

function ensureLifeSkills(lifeSkills) {
  for (const st of SKILL_TYPES) {
    if (!lifeSkills[st]) {
      lifeSkills[st] = { level: 1, exp: 0, speed_level: 1, luck_level: 1, is_active: false, gather_progress: 0 };
    }
  }
  return lifeSkills;
}

function buildSkillResponse(lifeSkills, skillType, charId) {
  const s = lifeSkills[skillType];
  const baseCycle = 20;
  const speedReduction = 1 - ((s.speed_level || 1) - 1) * 0.08;
  const cycleDuration = Math.max(5, baseCycle * speedReduction);
  const expToNext = s.level * 100;
  return {
    id: `${skillType}_${charId}`,
    skill_type: skillType,
    level: s.level,
    exp: s.exp || 0,
    exp_to_next: expToNext,
    gather_progress: s.gather_progress || 0,
    cycle_duration: Math.round(cycleDuration * 10) / 10,
    xp_per_cycle: 15 + s.level * 2,
    speed_level: s.speed_level || 1,
    xp_boost_level: s.xp_boost_level || s.luck_level || 1,
    speed_upgrade_cost: (s.speed_level || 1) * 50,
    xp_boost_upgrade_cost: (s.xp_boost_level || s.luck_level || 1) * 80,
    is_active: s.is_active || false,
  };
}

function buildProcessingResponse(lifeSkills) {
  const result = {};
  for (const [key, data] of Object.entries(PROCESSING_RECIPES)) {
    const reqSkill = data.requires_skill;
    const reqLevel = data.requires_level;
    const skillLevel = (lifeSkills[reqSkill]?.level) || 1;
    result[key] = { ...data, is_unlocked: skillLevel >= reqLevel };
  }
  return result;
}

async function handleLocalFunction(functionName, params) {
  const characterId = params.characterId || params.character_id;

  switch (functionName) {
    case 'getCurrentUser': {
      const user = getLocalUser();
      return { data: user || { id: 'local', email: 'player@local', role: 'admin' } };
    }

    case 'registerUser':
      return { data: { success: true } };

    case 'getAllUsers': {
      const user = getLocalUser();
      return { data: [user || { id: 'local', email: 'player@local', role: 'admin' }] };
    }

    case 'getAllCharacters': {
      const chars = getStore('Character');
      return { data: chars };
    }

    case 'updateUserRole':
      return { data: { success: true } };

    case 'managePlayer': {
      const targetId = params.target_character_id || params.characterId;
      const action = params.action;
      if (targetId && action) {
        const chars = getStore('Character');
        const idx = chars.findIndex(c => c.id === targetId);
        if (idx !== -1) {
          if (action === 'ban') chars[idx].is_banned = true;
          else if (action === 'unban') chars[idx].is_banned = false;
          else if (action === 'mute') chars[idx].is_muted = true;
          else if (action === 'unmute') chars[idx].is_muted = false;
          else if (action === 'kick') {
            chars[idx].guild_id = null;
            chars[idx].guild_name = null;
          }
          else if (action === 'delete_from_leaderboard') chars[idx].deleted_from_leaderboard = true;
          else if (action === 'restore_leaderboard') chars[idx].deleted_from_leaderboard = false;
          else if (action === 'update_stats' && params.data) {
            for (const [k, v] of Object.entries(params.data)) {
              chars[idx][k] = v;
            }
          }
          else if (action === 'delete') {
            const deleted = chars.splice(idx, 1)[0];
            setStore('Character', chars);
            const items = getStore('Item').filter(i => i.owner_id !== targetId);
            setStore('Item', items);
            return { data: { success: true, deleted: true } };
          }
          setStore('Character', chars);
          return { data: { success: true, data: chars[idx] } };
        }
      }
      if (action === 'delete_guild') {
        const guildId = params.guild_id;
        if (guildId) {
          let guilds = getStore('Guild');
          guilds = guilds.filter(g => g.id !== guildId);
          setStore('Guild', guilds);
          const chars = getStore('Character');
          for (let i = 0; i < chars.length; i++) {
            if (chars[i].guild_id === guildId) {
              chars[i].guild_id = null;
              chars[i].guild_name = null;
            }
          }
          setStore('Character', chars);
          return { data: { success: true, deleted: true } };
        }
      }
      return { data: { success: true } };
    }

    case 'claimDailyLogin': {
      const chars = getStore('Character');
      const idx = chars.findIndex(c => c.id === characterId);
      if (idx === -1) return { data: { streak: 1, rewards: { gold: 100, gems: 0 } } };
      const char = chars[idx];
      const now = new Date();
      const lastLogin = char.last_daily_login ? new Date(char.last_daily_login) : null;
      const isConsecutive = lastLogin && (now.getTime() - lastLogin.getTime()) < 48 * 60 * 60 * 1000;
      const streak = isConsecutive ? (char.daily_login_streak || 0) + 1 : 1;
      const goldReward = 100 + (streak * 50);
      const gemReward = streak >= 7 ? 5 : (streak >= 3 ? 2 : 0);
      chars[idx] = {
        ...char,
        daily_login_streak: streak,
        last_daily_login: now.toISOString(),
        gold: (char.gold || 0) + goldReward,
        gems: (char.gems || 0) + gemReward,
      };
      setStore('Character', chars);
      notifySubscribers('Character', { type: 'update', id: characterId, data: chars[idx] });
      return { data: { streak, rewards: { gold: goldReward, gems: gemReward }, character: chars[idx] } };
    }

    case 'sellItem': {
      const { itemId } = params;
      const items = getStore('Item');
      const itemIdx = items.findIndex(i => i.id === itemId);
      if (itemIdx === -1) return { data: { success: false, message: 'Item not found' } };
      const item = items[itemIdx];
      const rarityMultiplier = { common: 1, uncommon: 2, rare: 5, epic: 10, legendary: 25, mythic: 50, shiny: 100 };
      const goldValue = (item.level || 1) * 10 * (rarityMultiplier[item.rarity] || 1);
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === item.owner_id);
      if (charIdx !== -1) {
        chars[charIdx].gold = (chars[charIdx].gold || 0) + goldValue;
        setStore('Character', chars);
        notifySubscribers('Character', { type: 'update', id: chars[charIdx].id, data: chars[charIdx] });
      }
      items.splice(itemIdx, 1);
      setStore('Item', items);
      notifySubscribers('Item', { type: 'delete', id: itemId });
      return { data: { success: true, gold_earned: goldValue } };
    }

    case 'upgradeItemSafe': {
      const { itemId } = params;
      const items = getStore('Item');
      const itemIdx = items.findIndex(i => i.id === itemId);
      if (itemIdx === -1) return { data: { success: false, message: 'Item not found' } };
      const item = items[itemIdx];
      const currentUpgrade = item.upgrade_level || 0;
      if (currentUpgrade >= 20) return { data: { success: false, message: 'Max upgrade level reached' } };
      const rarityMults = { common: 1.0, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 3.0, mythic: 4.0, set: 3.5, shiny: 5.0 };
      const rMult = rarityMults[item.rarity] || 1.0;
      const cost = Math.floor(300 * (currentUpgrade + 1) * rMult);
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === item.owner_id);
      if (charIdx === -1 || (chars[charIdx].gold || 0) < cost) {
        return { data: { success: false, message: 'Not enough gold' } };
      }
      items[itemIdx].upgrade_level = currentUpgrade + 1;
      const newLevel = currentUpgrade + 1;
      if (item.stats) {
        const statBoost = 1 + newLevel * 0.05;
        const prevBoost = 1 + currentUpgrade * 0.05;
        const baseStats = {};
        for (const [k, v] of Object.entries(item.stats)) {
          if (v && v !== 0) {
            const baseVal = Math.round(v / prevBoost);
            baseStats[k] = Math.round(baseVal * statBoost);
          } else {
            baseStats[k] = v;
          }
        }
        items[itemIdx].stats = baseStats;
      }
      chars[charIdx].gold = (chars[charIdx].gold || 0) - cost;
      setStore('Item', items);
      setStore('Character', chars);
      notifySubscribers('Item', { type: 'update', id: itemId, data: items[itemIdx] });
      return { data: { success: true, item: items[itemIdx], gold_spent: cost, message: `Upgraded to +${newLevel}` } };
    }

    case 'starUpgradeItem': {
      const { itemId } = params;
      const items = getStore('Item');
      const itemIdx = items.findIndex(i => i.id === itemId);
      if (itemIdx === -1) return { data: { success: false, message: 'Item not found' } };
      const item = items[itemIdx];
      const currentStar = item.star_level || 0;
      if (currentStar >= 7) return { data: { success: false, message: 'Max star level reached' } };
      const rarityMults = { common: 1.0, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 3.0, mythic: 4.0, set: 3.5, shiny: 5.0 };
      const rMult = rarityMults[item.rarity] || 1.0;
      const gemCost = Math.ceil(5 * Math.pow(1.5, currentStar) * rMult);
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === item.owner_id);
      if (charIdx === -1 || (chars[charIdx].gems || 0) < gemCost) {
        return { data: { success: false, message: 'Not enough gems' } };
      }
      chars[charIdx].gems = (chars[charIdx].gems || 0) - gemCost;
      const STAR_SUCCESS = { 0: 0.90, 1: 0.75, 2: 0.50, 3: 0.35, 4: 0.12, 5: 0.08, 6: 0.02 };
      const successChance = STAR_SUCCESS[currentStar] || 0.02;
      const success = Math.random() < successChance;
      if (success) {
        items[itemIdx].star_level = currentStar + 1;
        if (item.stats) {
          const starBoost = 1.15;
          for (const [k, v] of Object.entries(items[itemIdx].stats)) {
            if (v && v !== 0) items[itemIdx].stats[k] = Math.round(v * starBoost);
          }
        }
        setStore('Item', items);
        setStore('Character', chars);
        notifySubscribers('Item', { type: 'update', id: itemId, data: items[itemIdx] });
        return { data: { success: true, item: items[itemIdx], gems_spent: gemCost, message: `Star upgraded to ⭐${currentStar + 1}! Stats boosted by 15%!` } };
      }
      items.splice(itemIdx, 1);
      setStore('Item', items);
      setStore('Character', chars);
      notifySubscribers('Item', { type: 'delete', id: itemId });
      return { data: { success: false, message: `Star upgrade failed! ${item.name} was destroyed!`, gems_spent: gemCost, itemDestroyed: true } };
    }

    case 'awakenItem': {
      const { itemId } = params;
      const items = getStore('Item');
      const itemIdx = items.findIndex(i => i.id === itemId);
      if (itemIdx === -1) return { data: { success: false, message: 'Item not found' } };
      const item = items[itemIdx];
      if ((item.star_level || 0) < 7) return { data: { success: false, message: 'Requires ⭐7' } };
      if (item.is_awakened) return { data: { success: false, message: 'Already awakened' } };
      const gemCost = 50;
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === item.owner_id);
      if (charIdx === -1 || (chars[charIdx].gems || 0) < gemCost) {
        return { data: { success: false, message: 'Not enough gems' } };
      }
      items[itemIdx].is_awakened = true;
      if (item.stats) {
        for (const [k, v] of Object.entries(items[itemIdx].stats)) {
          if (v && v !== 0) items[itemIdx].stats[k] = Math.round(v * 1.5);
        }
      }
      chars[charIdx].gems = (chars[charIdx].gems || 0) - gemCost;
      setStore('Item', items);
      setStore('Character', chars);
      return { data: { success: true, item: items[itemIdx], gems_spent: gemCost, message: 'Item awakened! Stats boosted by 50%!' } };
    }

    case 'getShopRotation': {
      const ROTATION_MS = 4 * 60 * 60 * 1000;
      const REFRESH_GEM_COST = 5;
      const chars = getStore('Character');
      const char = chars.find(c => c.id === characterId);
      const charLevel = char?.level || 1;

      const cacheKey = `eb_shop_cache_${characterId}`;
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch {}

      const isExpired = !cached || !cached.expiresAt || Date.now() >= cached.expiresAt;

      if (params.forceRefresh && !isExpired) {
        if ((char?.gems || 0) < REFRESH_GEM_COST) {
          return { data: { success: false, error: 'Not enough gems (5 required to refresh)' } };
        }
        const charIdx = chars.findIndex(c => c.id === characterId);
        chars[charIdx].gems = (chars[charIdx].gems || 0) - REFRESH_GEM_COST;
        setStore('Character', chars);
      }

      const shouldGenerate = isExpired || params.forceRefresh;

      if (!shouldGenerate && cached) {
        return { data: { success: true, items: cached.items, nextRefreshAt: new Date(cached.expiresAt).toISOString(), gemsSpent: 0 } };
      }

      const EQUIP_TYPES = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];
      const EQUIP_NAMES = {
        weapon: ['Sword', 'Axe', 'Staff', 'Dagger', 'Bow', 'Mace', 'Spear', 'Wand'],
        armor: ['Plate', 'Chainmail', 'Leather Vest', 'Robe', 'Brigandine', 'Scale Mail'],
        helmet: ['Helm', 'Crown', 'Hood', 'Circlet', 'Visor', 'Headband'],
        boots: ['Greaves', 'Sandals', 'Treads', 'Sabatons', 'Moccasins'],
        ring: ['Ring', 'Band', 'Signet', 'Loop', 'Seal'],
        amulet: ['Amulet', 'Pendant', 'Necklace', 'Talisman', 'Charm'],
      };
      const PREFIXES = ['Sturdy', 'Enchanted', 'Reinforced', 'Ancient', 'Mystic', 'Shadow', 'Blazing', 'Frozen', 'Holy', 'Void'];
      const RARITIES = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'legendary'];
      const RARITY_MULT = { common: 1, uncommon: 1.5, rare: 2.5, epic: 4, legendary: 7, mythic: 12 };
      const STAT_KEYS = {
        weapon: ['attack', 'strength', 'crit_chance'],
        armor: ['defense', 'vitality', 'hp_bonus'],
        helmet: ['defense', 'intelligence', 'mp_bonus'],
        boots: ['dexterity', 'evasion', 'speed'],
        ring: ['luck', 'crit_chance', 'attack'],
        amulet: ['intelligence', 'mp_bonus', 'magic_attack'],
      };

      const genId = Date.now();
      const items = [];
      for (let i = 0; i < 8; i++) {
        const s1 = Math.random();
        const s2 = Math.random();
        const s3 = Math.random();
        const s4 = Math.random();

        const type = EQUIP_TYPES[Math.floor(s1 * EQUIP_TYPES.length)];
        const nameList = EQUIP_NAMES[type];
        const baseName = nameList[Math.floor(s2 * nameList.length)];
        const prefix = PREFIXES[Math.floor(s3 * PREFIXES.length)];
        const rarity = RARITIES[Math.floor(s4 * RARITIES.length)];
        const mult = RARITY_MULT[rarity] || 1;

        const iLv = Math.max(1, charLevel + Math.floor((s1 - 0.5) * 6));
        const statPool = STAT_KEYS[type] || ['attack', 'defense'];
        const stats = {};
        statPool.forEach((sk, si) => {
          const val = Math.max(1, Math.floor((iLv * (1 + si * 0.3) * mult) * (0.7 + Math.random() * 0.6)));
          stats[sk] = val;
        });

        const basePrice = Math.floor(iLv * 25 * mult * (0.8 + s2 * 0.4));
        items.push({
          id: `shop_${genId}_${i}`,
          name: `${prefix} ${baseName}`,
          type,
          rarity,
          item_level: iLv,
          stats,
          buy_price: basePrice,
          sell_price: Math.floor(basePrice * 0.3),
          description: `A ${rarity} ${type} suited for level ${iLv} adventurers.`,
        });
      }

      items.push({
        id: `shop_${genId}_hp`,
        name: 'Health Potion',
        type: 'consumable',
        rarity: 'common',
        item_level: charLevel,
        stats: { hp_bonus: 50 + charLevel * 10 },
        buy_price: 50 + charLevel * 5,
        sell_price: 15,
        description: `Restores ${50 + charLevel * 10} HP.`,
      });
      items.push({
        id: `shop_${genId}_mp`,
        name: 'Mana Potion',
        type: 'consumable',
        rarity: 'common',
        item_level: charLevel,
        stats: { mp_bonus: 30 + charLevel * 5 },
        buy_price: 50 + charLevel * 5,
        sell_price: 15,
        description: `Restores ${30 + charLevel * 5} MP.`,
      });

      const expiresAt = Date.now() + ROTATION_MS;
      const nextRefreshAt = new Date(expiresAt).toISOString();
      localStorage.setItem(cacheKey, JSON.stringify({ items, expiresAt }));

      if (supabaseSync.isEnabled()) {
        supabaseSync.storeTimestamp(characterId, 'shop_rotation_ts', Date.now()).catch(() => {});
      }
      return { data: { success: true, items, nextRefreshAt, gemsSpent: (!isExpired && params.forceRefresh) ? REFRESH_GEM_COST : 0 } };
    }

    case 'manageDailyQuests': {
      const existing = getStore('Quest').filter(q => q.character_id === characterId);
      const today = new Date().toDateString();
      const todayActive = existing.filter(q => q.is_daily && q.status === 'active' && new Date(q.created_date).toDateString() === today);
      if (todayActive.length >= 3) return { data: { quests: existing } };

      const oldDailies = existing.filter(q => q.is_daily && new Date(q.created_date).toDateString() !== today);
      let quests = getStore('Quest').filter(q => !oldDailies.find(od => od.id === q.id));

      const questTemplates = [
        { title: 'Monster Slayer', description: 'Kill 10 enemies', objective_type: 'combat_kills', target_count: 10, rewards: { gold: 200, exp: 100 } },
        { title: 'Gold Hoarder', description: 'Earn 500 gold', objective_type: 'gold_earned', target_count: 500, rewards: { gold: 300, gems: 1 } },
        { title: 'Level Up', description: 'Gain a level', objective_type: 'level_up', target_count: 1, rewards: { gold: 500, gems: 2 } },
        { title: 'Mining Expert', description: 'Gather 5 ores', objective_type: 'mining', target_count: 5, rewards: { gold: 150, exp: 80 } },
        { title: 'Fisher\'s Haul', description: 'Catch 5 fish', objective_type: 'fishing', target_count: 5, rewards: { gold: 150, exp: 80 } },
        { title: 'Herb Collector', description: 'Gather 5 herbs', objective_type: 'herbalism', target_count: 5, rewards: { gold: 150, exp: 80 } },
        { title: 'Elite Hunter', description: 'Defeat 3 elite enemies', objective_type: 'combat_kills', target_count: 3, rewards: { gold: 400, gems: 2 } },
        { title: 'Battle Hardened', description: 'Win 20 battles', objective_type: 'combat_kills', target_count: 20, rewards: { gold: 500, exp: 300, gems: 1 } },
      ];

      const shuffled = [...questTemplates].sort(() => Math.random() - 0.5);
      const needed = 3 - todayActive.length;
      const newQuests = [];
      for (const template of shuffled.slice(0, needed)) {
        const quest = {
          id: generateId(),
          character_id: characterId,
          type: 'daily',
          is_daily: true,
          title: template.title,
          description: template.description,
          objective_type: template.objective_type,
          target_count: template.target_count,
          current_count: 0,
          rewards: template.rewards,
          status: 'active',
          created_date: new Date().toISOString(),
        };
        quests.push(quest);
        newQuests.push(quest);
      }
      setStore('Quest', quests);
      return { data: { quests: [...todayActive, ...newQuests] } };
    }

    case 'updateQuestProgress': {
      const { objectiveType, questType, amount, targetResource } = params;
      const matchType = objectiveType || questType;
      const quests = getStore('Quest');
      let changed = false;
      for (let i = 0; i < quests.length; i++) {
        if (quests[i].character_id === characterId && quests[i].status === 'active') {
          if (quests[i].objective_type === matchType) {
            quests[i].current_count = Math.min((quests[i].current_count || 0) + (amount || 1), quests[i].target_count);
            if (quests[i].current_count >= quests[i].target_count) quests[i].status = 'completed';
            changed = true;
          }
        }
      }
      if (changed) {
        setStore('Quest', quests);
        notifySubscribers('Quest', { type: 'update' });
      }
      return { data: { success: true } };
    }

    case 'lifeSkills': {
      const action = params.action;
      const skillType = params.skill_type || params.skillType;
      const charId = params.character_id || characterId;

      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === charId);
      if (charIdx === -1) return { data: { skills: [], resources: [], processing: {} } };
      const char = chars[charIdx];
      const lifeSkills = ensureLifeSkills(char.life_skills || {});

      if (action === 'get_skills' || action === 'getState') {
        const resources = getStore('Resource').filter(r => r.character_id === charId);
        chars[charIdx].life_skills = lifeSkills;
        setStore('Character', chars);
        return {
          data: {
            skills: SKILL_TYPES.map(st => buildSkillResponse(lifeSkills, st, charId)),
            resources,
            processing: buildProcessingResponse(lifeSkills),
          },
        };
      }

      if (action === 'start') {
        for (const st of SKILL_TYPES) lifeSkills[st].is_active = false;
        if (lifeSkills[skillType]) {
          lifeSkills[skillType].is_active = true;
          lifeSkills[skillType].gather_progress = 0;
        }
        chars[charIdx].life_skills = lifeSkills;
        setStore('Character', chars);
        return {
          data: {
            success: true,
            skills: SKILL_TYPES.map(st => buildSkillResponse(lifeSkills, st, charId)),
          },
        };
      }

      if (action === 'stop') {
        if (lifeSkills[skillType]) {
          lifeSkills[skillType].is_active = false;
          lifeSkills[skillType].gather_progress = 0;
        }
        chars[charIdx].life_skills = lifeSkills;
        setStore('Character', chars);
        return {
          data: {
            success: true,
            skills: SKILL_TYPES.map(st => buildSkillResponse(lifeSkills, st, charId)),
          },
        };
      }

      if (action === 'tick') {
        const skill = lifeSkills[skillType];
        if (!skill || !skill.is_active) return { data: { success: false, message: 'Skill not active' } };

        const dropTable = LIFE_SKILL_DROPS[skillType] || [];
        const luckBonus = 1 + ((skill.luck_level || 1) - 1) * 0.15;
        const droppedResources = [];

        const numDrops = 1 + (Math.random() < 0.3 ? 1 : 0) + (Math.random() < 0.1 ? 1 : 0);
        for (let i = 0; i < numDrops; i++) {
          const drop = rollDrop(dropTable, luckBonus);
          if (drop) droppedResources.push(drop);
        }

        const resources = getStore('Resource');
        for (const drop of droppedResources) {
          const existing = resources.find(r =>
            r.character_id === charId && r.resource_type === drop.resource && r.rarity === drop.rarity
          );
          if (existing) {
            existing.quantity = (existing.quantity || 0) + 1;
          } else {
            resources.push({
              id: generateId(),
              character_id: charId,
              resource_type: drop.resource,
              rarity: drop.rarity,
              quantity: 1,
            });
          }
        }
        setStore('Resource', resources);
        notifySubscribers('Resource', { type: 'update' });
        if (supabaseSync.isEnabled()) {
          for (const drop of droppedResources) {
            const synced = resources.find(r =>
              r.character_id === charId && r.resource_type === drop.resource && r.rarity === drop.rarity
            );
            if (synced) supabaseSync.syncResource(synced).catch(() => {});
          }
        }

        const xpBoostLevel = skill.xp_boost_level || skill.luck_level || 1;
        const xpBoostMult = 1 + (xpBoostLevel - 1) * 0.10;
        const xpGain = Math.floor((15 + skill.level * 2) * xpBoostMult);
        skill.exp = (skill.exp || 0) + xpGain;
        const expToNext = skill.level * 100;
        let leveledUp = false;
        let newLevel = skill.level;
        if (skill.exp >= expToNext) {
          skill.level += 1;
          skill.exp = skill.exp - expToNext;
          leveledUp = true;
          newLevel = skill.level;
        }

        skill.gather_progress = 0;
        lifeSkills[skillType] = skill;
        chars[charIdx].life_skills = lifeSkills;
        setStore('Character', chars);
        if (supabaseSync.isEnabled()) {
          supabaseSync.syncCharacter(chars[charIdx]).catch(() => {});
        }

        return {
          data: {
            success: true,
            resources: droppedResources,
            leveled_up: leveledUp,
            new_level: newLevel,
          },
        };
      }

      if (action === 'upgrade') {
        const upgradeType = params.upgrade_type || params.upgradeType;
        const skill = lifeSkills[skillType];
        if (!skill) return { data: { success: false, message: 'Unknown skill' } };

        if (upgradeType === 'speed') {
          if ((skill.speed_level || 1) >= 10) return { data: { success: false, message: 'Max speed level' } };
          const cost = (skill.speed_level || 1) * 50;
          if ((char.gold || 0) < cost) return { data: { success: false, message: 'Not enough gold' } };
          skill.speed_level = (skill.speed_level || 1) + 1;
          chars[charIdx].gold = (char.gold || 0) - cost;
          lifeSkills[skillType] = skill;
          chars[charIdx].life_skills = lifeSkills;
          setStore('Character', chars);
          notifySubscribers('Character', { type: 'update', id: charId, data: chars[charIdx] });
          return { data: { success: true, gold_spent: cost, new_speed_level: skill.speed_level } };
        }

        if (upgradeType === 'luck' || upgradeType === 'xp_boost') {
          const lvlKey = 'xp_boost_level';
          const currentLvl = skill[lvlKey] || skill.luck_level || 1;
          if (currentLvl >= 10) return { data: { success: false, message: 'Max XP boost level' } };
          const cost = currentLvl * 80;
          if ((char.gold || 0) < cost) return { data: { success: false, message: 'Not enough gold' } };
          skill[lvlKey] = currentLvl + 1;
          if (skill.luck_level) delete skill.luck_level;
          chars[charIdx].gold = (char.gold || 0) - cost;
          lifeSkills[skillType] = skill;
          chars[charIdx].life_skills = lifeSkills;
          setStore('Character', chars);
          notifySubscribers('Character', { type: 'update', id: charId, data: chars[charIdx] });
          return { data: { success: true, gold_spent: cost, new_xp_boost_level: skill[lvlKey] } };
        }

        return { data: { success: false, message: 'Unknown upgrade type' } };
      }

      if (action === 'process') {
        const processType = params.process_type;
        const recipeInput = params.recipe_input;
        const quantity = params.quantity || 1;

        const recipeGroup = PROCESSING_RECIPES[processType];
        if (!recipeGroup) return { data: { success: false, message: 'Unknown process type' } };

        const recipe = recipeGroup.recipes.find(r => r.input === recipeInput);
        if (!recipe) return { data: { success: false, message: 'Recipe not found' } };

        const resources = getStore('Resource');
        const inputRes = resources.find(r =>
          r.character_id === charId && r.resource_type === recipe.input && r.rarity === recipe.rarity
        );
        if (!inputRes || inputRes.quantity < quantity) {
          return { data: { success: false, message: 'Not enough resources' } };
        }

        inputRes.quantity -= quantity;

        const outputRes = resources.find(r =>
          r.character_id === charId && r.resource_type === recipe.output && r.rarity === recipe.rarity
        );
        if (outputRes) {
          outputRes.quantity += quantity;
        } else {
          resources.push({
            id: generateId(),
            character_id: charId,
            resource_type: recipe.output,
            rarity: recipe.rarity,
            quantity,
          });
        }

        setStore('Resource', resources);
        notifySubscribers('Resource', { type: 'update' });
        return { data: { success: true } };
      }

      return { data: { life_skills: lifeSkills } };
    }

    case 'processGemLab': {
      let labs = getStore('GemLab');
      let lab = labs.find(l => l.character_id === characterId);
      if (!lab) {
        const chars = getStore('Character');
        const legacyChar = chars.find(c => c.id === characterId);
        const legacy = legacyChar?.gem_lab;
        lab = {
          id: generateId(),
          character_id: characterId,
          production_level: legacy?.level ? Math.max(0, legacy.level - 1) : 0,
          speed_level: 0,
          efficiency_level: 0,
          pending_gems: legacy?.gems_stored || 0,
          total_gems_generated: legacy?.gems_stored || 0,
          last_collection_time: new Date().toISOString(),
          created_date: new Date().toISOString(),
        };
        labs.push(lab);
        setStore('GemLab', labs);
        if (legacyChar && legacy) {
          delete legacyChar.gem_lab;
          setStore('Character', chars);
        }
      }
      const BASE_PRODUCTION = 0.001;
      const prodMult = 1 + (lab.production_level || 0) * 0.05;
      const speedMult = 1 + (lab.speed_level || 0) * 0.02;
      const effMult = 1 + (lab.efficiency_level || 0) * 0.03;
      const gemsPerCycle = BASE_PRODUCTION * prodMult * effMult;
      const cycleSeconds = (10 / speedMult) * 60;

      const now = Date.now();
      const lastProcess = lab.last_collection_time ? new Date(lab.last_collection_time).getTime() : now;
      const elapsedSeconds = Math.min((now - lastProcess) / 1000, 480 * 60);
      const completedCycles = Math.floor(elapsedSeconds / cycleSeconds);
      const gemsGenerated = gemsPerCycle * completedCycles;

      const labIdx = labs.findIndex(l => l.id === lab.id);
      if (completedCycles > 0) {
        labs[labIdx].pending_gems = (labs[labIdx].pending_gems || 0) + gemsGenerated;
        labs[labIdx].total_gems_generated = (labs[labIdx].total_gems_generated || 0) + gemsGenerated;
        const advanceMs = completedCycles * cycleSeconds * 1000;
        labs[labIdx].last_collection_time = new Date(lastProcess + advanceMs).toISOString();
      }
      setStore('GemLab', labs);
      if (supabaseSync.isEnabled()) {
        supabaseSync.syncGemLab(labs[labIdx]).catch(() => {});
      }
      return { data: { success: true, gemsGenerated, gemsPerCycle, cycleSeconds, offlineHours: (elapsedSeconds / 3600).toFixed(1) } };
    }

    case 'claimGemLabGems': {
      let labs = getStore('GemLab');
      let lab = labs.find(l => l.character_id === characterId);
      if (!lab) return { data: { success: false, claimedGems: 0, newTotal: 0 } };
      const gemsToAdd = Math.floor(lab.pending_gems || 0);
      if (gemsToAdd <= 0) return { data: { success: false, claimedGems: 0, newTotal: 0 } };
      const labIdx = labs.findIndex(l => l.id === lab.id);
      labs[labIdx].pending_gems = 0;
      labs[labIdx].last_collection_time = new Date().toISOString();
      setStore('GemLab', labs);

      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx !== -1) {
        chars[charIdx].gems = (chars[charIdx].gems || 0) + gemsToAdd;
        setStore('Character', chars);
      }
      if (supabaseSync.isEnabled()) {
        supabaseSync.syncGemLab(labs[labIdx]).catch(() => {});
        supabaseSync.syncCharacter(chars[charIdx]).catch(() => {});
      }
      return { data: { success: true, claimedGems: gemsToAdd, newTotal: chars[charIdx]?.gems || gemsToAdd } };
    }

    case 'upgradeGemLab': {
      const { upgradeType } = params;
      let labs = getStore('GemLab');
      let lab = labs.find(l => l.character_id === characterId);
      if (!lab) {
        lab = {
          id: generateId(),
          character_id: characterId,
          production_level: 0, speed_level: 0, efficiency_level: 0,
          pending_gems: 0, total_gems_generated: 0,
          last_collection_time: new Date().toISOString(),
          created_date: new Date().toISOString(),
        };
        labs.push(lab);
      }
      const BASE_COST = 1000;
      const COST_MULT = 1.15;
      const levelKey = upgradeType === 'production' ? 'production_level' : upgradeType === 'speed' ? 'speed_level' : 'efficiency_level';
      const currentLevel = lab[levelKey] || 0;
      const cost = Math.floor(BASE_COST * Math.pow(COST_MULT, currentLevel));

      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1 || (chars[charIdx].gold || 0) < cost) {
        return { data: { success: false, error: 'Not enough gold' } };
      }

      chars[charIdx].gold = (chars[charIdx].gold || 0) - cost;
      setStore('Character', chars);

      const labIdx = labs.findIndex(l => l.id === lab.id);
      labs[labIdx][levelKey] = currentLevel + 1;
      setStore('GemLab', labs);
      return { data: { success: true, upgradeType, goldRemaining: chars[charIdx].gold } };
    }

    case 'transmuteGold': {
      const { amount } = params;
      if (!characterId) return { data: { rate: 1000, description: '1000 gold = 1 gem' } };
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { success: false, message: 'Character not found' } };
      const goldCost = (amount || 1) * 1000;
      if ((chars[charIdx].gold || 0) < goldCost) return { data: { success: false, message: 'Not enough gold' } };
      chars[charIdx].gold = (chars[charIdx].gold || 0) - goldCost;
      chars[charIdx].gems = (chars[charIdx].gems || 0) + (amount || 1);
      setStore('Character', chars);
      return { data: { success: true, gold_spent: goldCost, gems_gained: amount || 1 } };
    }

    case 'completeTrade': {
      const { trade_id, action: rawAction } = params;
      const action = rawAction || 'accept';
      let trades = getStore('TradeSession');
      let idx = trades.findIndex(t => t.id === trade_id);
      if (idx === -1) {
        trades = getStore('Trade');
        idx = trades.findIndex(t => t.id === trade_id);
        if (idx === -1) return { data: { success: false, message: 'Trade not found' } };
        if (action === 'accept') { trades[idx].status = 'completed'; setStore('Trade', trades); }
        else if (action === 'decline' || action === 'cancel') { trades[idx].status = 'cancelled'; setStore('Trade', trades); }
        return { data: { success: true, trade_id, status: trades[idx].status } };
      }
      if (action === 'accept') {
        trades[idx].status = 'completed';
        setStore('TradeSession', trades);
        notifySubscribers('TradeSession', { type: 'update', id: trade_id, data: trades[idx] });
        return { data: { success: true, trade_id, status: 'completed' } };
      }
      if (action === 'decline' || action === 'cancel') {
        trades[idx].status = 'cancelled';
        setStore('TradeSession', trades);
        notifySubscribers('TradeSession', { type: 'update', id: trade_id, data: trades[idx] });
        return { data: { success: true, trade_id, status: 'cancelled' } };
      }
      return { data: { success: true, trade_id } };
    }

    case 'manageParty': {
      const { action, partyId, targetCharacterId, targetName, inviteId } = params;
      if (action === 'create') {
        const chars = getStore('Character');
        const char = chars.find(c => c.id === characterId);
        const party = {
          id: generateId(),
          leader_id: characterId,
          leader_name: char?.name || 'Unknown',
          members: [{ character_id: characterId, name: char?.name || 'Unknown', class: char?.class, level: char?.level }],
          status: 'active',
          max_members: 6,
          created_date: new Date().toISOString(),
        };
        const parties = getStore('Party');
        parties.push(party);
        setStore('Party', parties);
        notifySubscribers('Party', { type: 'create', id: party.id, data: party });
        return { data: { success: true, party } };
      }
      if (action === 'invite' && partyId) {
        const chars = getStore('Character');
        const fromChar = chars.find(c => c.id === characterId);
        let resolvedTargetId = targetCharacterId;
        if (targetName && !targetCharacterId?.includes('-')) {
          const targetChar = chars.find(c => c.name?.toLowerCase() === targetName.toLowerCase());
          if (targetChar) resolvedTargetId = targetChar.id;
          else return { data: { success: false, message: `Player "${targetName}" not found` } };
        }
        if (!resolvedTargetId) return { data: { success: false, message: 'No target specified' } };
        if (resolvedTargetId === characterId) return { data: { success: false, message: 'Cannot invite yourself' } };
        const invite = {
          id: generateId(),
          party_id: partyId,
          from_character_id: characterId,
          from_name: fromChar?.name || 'Unknown',
          to_character_id: resolvedTargetId,
          status: 'pending',
          created_date: new Date().toISOString(),
        };
        const invites = getStore('PartyInvite');
        invites.push(invite);
        setStore('PartyInvite', invites);
        notifySubscribers('PartyInvite', { type: 'create', id: invite.id, data: invite });
        return { data: { success: true, invite } };
      }
      if (action === 'accept' && inviteId) {
        const invites = getStore('PartyInvite');
        const inv = invites.find(i => i.id === inviteId);
        if (!inv || inv.status !== 'pending') return { data: { success: false, message: 'Invite not found or expired' } };
        inv.status = 'accepted';
        setStore('PartyInvite', invites);
        const parties = getStore('Party');
        const pIdx = parties.findIndex(p => p.id === inv.party_id);
        if (pIdx === -1) return { data: { success: false, message: 'Party no longer exists' } };
        const members = parties[pIdx].members || [];
        if (members.length >= (parties[pIdx].max_members || 6)) return { data: { success: false, message: 'Party is full' } };
        if (members.some(m => m.character_id === characterId)) return { data: { success: true, message: 'Already in party' } };
        const chars = getStore('Character');
        const char = chars.find(c => c.id === characterId);
        members.push({ character_id: characterId, name: char?.name || 'Unknown', class: char?.class, level: char?.level });
        parties[pIdx].members = members;
        setStore('Party', parties);
        notifySubscribers('Party', { type: 'update', id: parties[pIdx].id, data: parties[pIdx] });
        return { data: { success: true, party: parties[pIdx] } };
      }
      if (action === 'decline' && inviteId) {
        const invites = getStore('PartyInvite');
        const inv = invites.find(i => i.id === inviteId);
        if (inv) inv.status = 'declined';
        setStore('PartyInvite', invites);
        return { data: { success: true } };
      }
      if (action === 'join' && partyId) {
        const parties = getStore('Party');
        const pIdx = parties.findIndex(p => p.id === partyId);
        if (pIdx === -1) return { data: { success: false, message: 'Party not found' } };
        const members = parties[pIdx].members || [];
        if (members.length >= (parties[pIdx].max_members || 6)) {
          return { data: { success: false, message: 'Party is full' } };
        }
        const chars = getStore('Character');
        const char = chars.find(c => c.id === characterId);
        members.push({ character_id: characterId, name: char?.name || 'Unknown', class: char?.class, level: char?.level });
        parties[pIdx].members = members;
        setStore('Party', parties);
        return { data: { success: true, party: parties[pIdx] } };
      }
      if (action === 'leave' && partyId) {
        const parties = getStore('Party');
        const pIdx = parties.findIndex(p => p.id === partyId);
        if (pIdx !== -1) {
          parties[pIdx].members = (parties[pIdx].members || []).filter(m => m.character_id !== characterId);
          if (parties[pIdx].members.length === 0) {
            parties[pIdx].status = 'disbanded';
          }
          setStore('Party', parties);
        }
        return { data: { success: true } };
      }
      if (action === 'disband' && partyId) {
        const parties = getStore('Party');
        const pIdx = parties.findIndex(p => p.id === partyId);
        if (pIdx !== -1) {
          parties[pIdx].status = 'disbanded';
          parties[pIdx].members = [];
          setStore('Party', parties);
        }
        return { data: { success: true } };
      }
      return { data: { success: true } };
    }

    case 'manageFriends': {
      const { action, targetCharacterId, requestId } = params;
      if (action === 'send') {
        const req = {
          id: generateId(),
          from_character_id: characterId,
          to_character_id: targetCharacterId,
          status: 'pending',
          created_date: new Date().toISOString(),
        };
        const requests = getStore('FriendRequest');
        requests.push(req);
        setStore('FriendRequest', requests);
        notifySubscribers('FriendRequest', { type: 'create', id: req.id, data: req });
        return { data: { success: true, request: req } };
      }
      if (action === 'accept' && requestId) {
        const requests = getStore('FriendRequest');
        const rIdx = requests.findIndex(r => r.id === requestId);
        if (rIdx === -1) return { data: { success: false, message: 'Request not found' } };
        requests[rIdx].status = 'accepted';
        setStore('FriendRequest', requests);
        const friendship = {
          id: generateId(),
          character_id_1: requests[rIdx].from_character_id,
          character_id_2: requests[rIdx].to_character_id,
          created_date: new Date().toISOString(),
        };
        const friendships = getStore('Friendship');
        friendships.push(friendship);
        setStore('Friendship', friendships);
        notifySubscribers('Friendship', { type: 'create', id: friendship.id, data: friendship });
        return { data: { success: true, friendship } };
      }
      if (action === 'decline' && requestId) {
        const requests = getStore('FriendRequest');
        const rIdx = requests.findIndex(r => r.id === requestId);
        if (rIdx !== -1) {
          requests[rIdx].status = 'declined';
          setStore('FriendRequest', requests);
        }
        return { data: { success: true } };
      }
      if (action === 'remove') {
        let friendships = getStore('Friendship');
        friendships = friendships.filter(f =>
          !((f.character_id_1 === characterId && f.character_id_2 === targetCharacterId) ||
            (f.character_id_2 === characterId && f.character_id_1 === targetCharacterId))
        );
        setStore('Friendship', friendships);
        return { data: { success: true } };
      }
      return { data: { success: true } };
    }

    case 'getLeaderboard': {
      const chars = getStore('Character');
      const sorted = [...chars].sort((a, b) => (b.level || 1) - (a.level || 1));
      const leaderboard = sorted.slice(0, 50).map((c, i) => ({
        rank: i + 1,
        id: c.id,
        name: c.name,
        class: c.class,
        level: c.level || 1,
        total_kills: c.total_kills || 0,
        prestige_level: c.prestige_level || 0,
        guild_name: c.guild_name || null,
      }));
      return { data: { leaderboard } };
    }

    case 'dungeonAction': {
      const { action, dungeonId } = params;
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { success: false, message: 'Character not found' } };
      const char = chars[charIdx];

      if (action === 'enter') {
        const session = {
          id: generateId(),
          character_id: characterId,
          dungeon_id: dungeonId || 'cave_of_shadows',
          status: 'active',
          floor: 1,
          enemies_defeated: 0,
          boss_hp: 500 + (char.level || 1) * 50,
          boss_max_hp: 500 + (char.level || 1) * 50,
          created_date: new Date().toISOString(),
        };
        const sessions = getStore('DungeonSession');
        sessions.push(session);
        setStore('DungeonSession', sessions);
        return { data: { success: true, session } };
      }

      if (action === 'attack') {
        const sessions = getStore('DungeonSession');
        const sIdx = sessions.findIndex(s => s.character_id === characterId && s.status === 'active');
        if (sIdx === -1) return { data: { success: false, message: 'No active dungeon' } };

        const session = sessions[sIdx];
        const playerDmg = (char.strength || 10) * (1 + Math.random() * 0.5);
        const enemyDmg = Math.floor(10 + session.floor * 5 * Math.random());
        session.boss_hp = Math.max(0, (session.boss_hp || 0) - Math.floor(playerDmg));

        let result = { player_damage: Math.floor(playerDmg), enemy_damage: enemyDmg };

        if (session.boss_hp <= 0) {
          session.enemies_defeated = (session.enemies_defeated || 0) + 1;
          session.floor = (session.floor || 1) + 1;
          session.boss_hp = 500 + (char.level || 1) * 50 * session.floor;
          session.boss_max_hp = session.boss_hp;
          const goldReward = 50 * session.floor;
          const expReward = 30 * session.floor;
          chars[charIdx].gold = (char.gold || 0) + goldReward;
          chars[charIdx].exp = (char.exp || 0) + expReward;
          setStore('Character', chars);
          result.floor_cleared = true;
          result.rewards = { gold: goldReward, exp: expReward };
          result.new_floor = session.floor;
        }

        setStore('DungeonSession', sessions);
        return { data: { success: true, session, ...result } };
      }

      if (action === 'flee' || action === 'leave') {
        const sessions = getStore('DungeonSession');
        const sIdx = sessions.findIndex(s => s.character_id === characterId && s.status === 'active');
        if (sIdx !== -1) {
          sessions[sIdx].status = 'completed';
          setStore('DungeonSession', sessions);
        }
        return { data: { success: true } };
      }

      return { data: { success: true, result: params } };
    }

    case 'catchUpOfflineProgress': {
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { rewards: null, hours: 0 } };
      const char = chars[charIdx];
      const lastClaim = char.last_idle_claim ? new Date(char.last_idle_claim).getTime() : Date.now();
      const offlineMs = Date.now() - lastClaim;
      const offlineHours = Math.min(offlineMs / (1000 * 60 * 60), 8);
      if (offlineHours < 0.1) return { data: { rewards: null, hours: 0 } };
      const goldReward = Math.floor(offlineHours * (char.level || 1) * 50);
      const expReward = Math.floor(offlineHours * (char.level || 1) * 20);
      chars[charIdx].gold = (char.gold || 0) + goldReward;
      chars[charIdx].exp = (char.exp || 0) + expReward;
      chars[charIdx].last_idle_claim = new Date().toISOString();
      setStore('Character', chars);
      return { data: { rewards: { gold: goldReward, exp: expReward }, hours: Math.round(offlineHours * 10) / 10 } };
    }

    case 'fight': {
      try {
        const { enemyKey, regionKey, isElite, isBoss, equipmentIds, partySize: pSize, skillUsed, _fallbackCharacter } = params;
        let chars = getStore('Character');
        let charIdx = chars.findIndex(c => c.id === characterId);
        if (charIdx === -1 && _fallbackCharacter && _fallbackCharacter.id === characterId) {
          chars.push(_fallbackCharacter);
          setStore('Character', chars);
          charIdx = chars.length - 1;
        }
        if (charIdx === -1) return { data: { success: false, error: 'Character not found' } };
        const char = chars[charIdx];

        const enemyData = GAME_ENEMIES?.[enemyKey];
        if (!enemyData) return { data: { success: false, error: 'Unknown enemy: ' + enemyKey } };

        const baseExpReward = enemyData.expReward || 10;
        const baseGoldReward = enemyData.goldReward || 5;

        const empoweredMult = params.isEmpowered ? 3 : 1;
        const partyMembers = Math.max(0, (pSize || 1) - 1);
        const partyExpBonus = partyMembers * 0.05;
        const partyGoldBonus = partyMembers * 0.10;
        const expGain = Math.round(baseExpReward * empoweredMult * (1 + partyExpBonus));
        const goldGain = Math.round(baseGoldReward * empoweredMult * (1 + partyGoldBonus));

        let newExp = (char.exp || 0) + expGain;
        let newLevel = char.level || 1;
        let newExpToNext = char.exp_to_next || calcExpToLevel(newLevel);
        let newStatPoints = char.stat_points || 0;
        let newSkillPoints = char.skill_points || 0;
        const levelsGained = [];

        while (newExp >= newExpToNext) {
          newExp -= newExpToNext;
          newLevel++;
          newExpToNext = calcExpToLevel(newLevel);
          newStatPoints += 3;
          newSkillPoints += 1;
          levelsGained.push(newLevel);
        }

        const levelDiff = newLevel - (char.level || 1);
        const newMaxHp = (char.max_hp || 100) + levelDiff * 5;
        const newMaxMp = (char.max_mp || 50) + levelDiff * 3;
        const newGold = (char.gold || 0) + goldGain;
        const newTotalKills = (char.total_kills || 0) + 1;

        let lootDrop = null;
        try {
          lootDrop = gameLootGen(
            newLevel,
            char.luck || 5,
            isElite || isBoss || params.isEmpowered || false,
            regionKey || char.current_region,
            char.class
          );
        } catch {}

        if (lootDrop) {
          const items = getStore('Item');
          const newItem = { id: generateId(), ...lootDrop, owner_id: characterId };
          items.push(newItem);
          setStore('Item', items);
          notifySubscribers('Item', { type: 'create', data: newItem });
          lootDrop = newItem;
        }

        chars[charIdx] = {
          ...chars[charIdx],
          exp: newExp,
          level: newLevel,
          exp_to_next: newExpToNext,
          gold: newGold,
          stat_points: newStatPoints,
          skill_points: newSkillPoints,
          total_kills: newTotalKills,
          max_hp: newMaxHp,
          max_mp: newMaxMp,
        };
        setStore('Character', chars);
        notifySubscribers('Character', { type: 'update', id: characterId, data: chars[charIdx] });

        try {
          handleLocalFunction('updateQuestProgress', {
            characterId, objectiveType: 'combat_kills', amount: 1,
          });
          if (goldGain > 0) {
            handleLocalFunction('updateQuestProgress', {
              characterId, objectiveType: 'gold_earned', amount: goldGain,
            });
          }
          if (levelDiff > 0) {
            handleLocalFunction('updateQuestProgress', {
              characterId, objectiveType: 'level_up', amount: levelDiff,
            });
          }
        } catch {}

        if (supabaseSync.isEnabled()) {
          supabaseSync.syncCharacter(chars[charIdx]).catch(() => {});
          if (lootDrop) supabaseSync.syncItem(lootDrop).catch(() => {});
        }

        return {
          data: {
            success: true,
            rewards: { exp: expGain, gold: goldGain },
            partyBonuses: partyMembers > 0 ? { expPct: Math.round(partyExpBonus * 100), goldPct: Math.round(partyGoldBonus * 100) } : null,
            character: chars[charIdx],
            levelsGained,
            loot: lootDrop,
            newLevel,
            newExp,
            newGold,
          },
        };
      } catch (fightErr) {
        console.error('[fight] Internal error:', fightErr);
        return { data: { success: false, error: fightErr.message || 'Internal fight error' } };
      }
    }

    case 'getPlayer': {
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { success: false, error: 'Character not found' } };
      const char = chars[charIdx];

      const lastClaim = char.last_idle_claim ? new Date(char.last_idle_claim).getTime() : Date.now();
      const offlineMs = Date.now() - lastClaim;
      const offlineHours = Math.min(offlineMs / (1000 * 60 * 60), 8);
      let idleGold = 0;
      let idleExp = 0;

      if (offlineHours >= 0.1) {
        idleGold = Math.floor(offlineHours * (char.level || 1) * 50);
        idleExp = Math.floor(offlineHours * (char.level || 1) * 20);

        chars[charIdx].gold = (char.gold || 0) + idleGold;
        chars[charIdx].exp = (char.exp || 0) + idleExp;
        chars[charIdx].last_idle_claim = new Date().toISOString();

        let newExpToNext = char.exp_to_next || Math.floor(100 * Math.pow(1.15, (char.level || 1) - 1));
        while (chars[charIdx].exp >= newExpToNext) {
          chars[charIdx].exp -= newExpToNext;
          chars[charIdx].level = (chars[charIdx].level || 1) + 1;
          newExpToNext = Math.floor(100 * Math.pow(1.15, chars[charIdx].level - 1));
          chars[charIdx].exp_to_next = newExpToNext;
          chars[charIdx].stat_points = (chars[charIdx].stat_points || 0) + 3;
          chars[charIdx].skill_points = (chars[charIdx].skill_points || 0) + 1;
        }

        setStore('Character', chars);
      }

      return {
        data: {
          success: true,
          character: chars[charIdx],
          idleRewards: offlineHours >= 0.1 ? { gold: idleGold, exp: idleExp, hours: offlineHours.toFixed(1) } : null,
        },
      };
    }

    case 'processServerProgression': {
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { success: true } };
      const char = chars[charIdx];
      if (char.idle_mode) {
        const goldGain = Math.floor((char.level || 1) * 5);
        const expGain = Math.floor((char.level || 1) * 2);
        chars[charIdx].gold = (char.gold || 0) + goldGain;
        chars[charIdx].exp = (char.exp || 0) + expGain;
        const expToNext = char.exp_to_next || (char.level || 1) * 100;
        if (chars[charIdx].exp >= expToNext) {
          chars[charIdx].level = (char.level || 1) + 1;
          chars[charIdx].exp = chars[charIdx].exp - expToNext;
          chars[charIdx].exp_to_next = chars[charIdx].level * 100;
          chars[charIdx].stat_points = (char.stat_points || 0) + 3;
        }
        setStore('Character', chars);
        return { data: { success: true, gold_gained: goldGain, exp_gained: expGain, character: chars[charIdx] } };
      }
      return { data: { success: true } };
    }

    case 'unifiedPlayerProgression': {
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { success: true } };
      const char = chars[charIdx];
      const expToNext = char.exp_to_next || (char.level || 1) * 100;
      if ((char.exp || 0) >= expToNext) {
        chars[charIdx].level = (char.level || 1) + 1;
        chars[charIdx].exp = (char.exp || 0) - expToNext;
        chars[charIdx].exp_to_next = chars[charIdx].level * 100;
        chars[charIdx].stat_points = (char.stat_points || 0) + 3;
        chars[charIdx].skill_points = (char.skill_points || 0) + 1;
        setStore('Character', chars);
        return { data: { success: true, leveled_up: true, new_level: chars[charIdx].level, character: chars[charIdx] } };
      }
      return { data: { success: true, leveled_up: false } };
    }

    case 'gameConfigManager': {
      const configKey = 'eb_gameConfig';
      if (params._method === 'POST' || params.action === 'update') {
        const configData = params.config || {};
        const id = params.id || 'global';
        localStorage.setItem(configKey, JSON.stringify({ id, config: configData }));
        return { data: { success: true, id, config: configData } };
      }
      try {
        const raw = localStorage.getItem(configKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { data: { success: true, id: parsed.id || 'global', config: parsed.config || parsed } };
        }
        return { data: { success: true, id: 'global', config: {} } };
      } catch {
        return { data: { success: true, id: 'global', config: {} } };
      }
    }

    default:
      console.warn(`[base44Client] Unknown function: ${functionName}`, params);
      return { data: { success: true } };
  }
}

async function handleRemoteFunction(functionName, params) {
  const result = await apiFetch(`/functions/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return { data: result.data || result };
}

export const base44 = {
  entities,

  functions: {
    async invoke(functionName, params = {}) {
      if (getMode() === 'server') {
        return handleRemoteFunction(functionName, params);
      }
      return handleLocalFunction(functionName, params);
    },
  },

  auth: {
    async me() {
      if (getMode() === 'server') {
        try {
          const res = await apiFetch('/auth/me');
          return res;
        } catch {
          return null;
        }
      }
      return getLocalUser() || { id: 'local-player', email: 'player@local', name: 'Player', role: 'admin' };
    },
  },

  async testConnection() {
    const url = getApiUrl();
    try {
      const res = await fetch(`${url}/api/test`);
      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  getMode,
  setMode,
  getApiUrl,
  setApiUrl,
};

export default base44;
