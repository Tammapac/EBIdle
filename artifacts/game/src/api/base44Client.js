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

function createEntityProxy(entityName) {
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
      return records[idx];
    },

    async delete(id) {
      let records = getStore(entityName);
      records = records.filter(r => r.id !== id);
      setStore(entityName, records);
      notifySubscribers(entityName, { type: 'delete', id });
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

const entityNames = [
  'Character', 'Item', 'Guild', 'Quest', 'Trade',
  'Party', 'PartyActivity', 'PartyInvite', 'Presence',
  'PlayerSession', 'ChatMessage', 'Mail', 'Resource',
  'FriendRequest', 'Friendship', 'TradeSession',
  'DungeonSession', 'GemLab', 'PrivateMessage',
];

const entities = {};
entityNames.forEach(name => {
  entities[name] = createEntityProxy(name);
});

function getLocalUser() {
  try {
    const raw = localStorage.getItem('eb_local_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function handleFunction(functionName, params) {
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
      if (params.characterId && params.action) {
        const chars = getStore('Character');
        const idx = chars.findIndex(c => c.id === params.characterId);
        if (idx !== -1) {
          if (params.action === 'ban') chars[idx].is_banned = true;
          else if (params.action === 'unban') chars[idx].is_banned = false;
          else if (params.action === 'mute') chars[idx].is_muted = true;
          else if (params.action === 'unmute') chars[idx].is_muted = false;
          setStore('Character', chars);
          return { data: chars[idx] };
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
      const cost = ((item.upgrade_level || 0) + 1) * 100;
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === item.owner_id);
      if (charIdx === -1 || (chars[charIdx].gold || 0) < cost) {
        return { data: { success: false, message: 'Not enough gold' } };
      }
      items[itemIdx].upgrade_level = (item.upgrade_level || 0) + 1;
      chars[charIdx].gold = (chars[charIdx].gold || 0) - cost;
      setStore('Item', items);
      setStore('Character', chars);
      return { data: { success: true, item: items[itemIdx], gold_spent: cost } };
    }

    case 'starUpgradeItem': {
      const { itemId } = params;
      const items = getStore('Item');
      const itemIdx = items.findIndex(i => i.id === itemId);
      if (itemIdx === -1) return { data: { success: false, message: 'Item not found' } };
      const item = items[itemIdx];
      const cost = ((item.star_level || 0) + 1) * 200;
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === item.owner_id);
      if (charIdx === -1 || (chars[charIdx].gold || 0) < cost) {
        return { data: { success: false, message: 'Not enough gold' } };
      }
      chars[charIdx].gold = (chars[charIdx].gold || 0) - cost;
      const successChance = Math.max(0.3, 1 - (item.star_level || 0) * 0.1);
      const success = Math.random() < successChance;
      if (success) {
        items[itemIdx].star_level = (item.star_level || 0) + 1;
        setStore('Item', items);
        setStore('Character', chars);
        return { data: { success: true, item: items[itemIdx], gold_spent: cost } };
      }
      setStore('Character', chars);
      return { data: { success: false, message: 'Star upgrade failed!', gold_spent: cost } };
    }

    case 'awakenItem': {
      const { itemId } = params;
      const items = getStore('Item');
      const itemIdx = items.findIndex(i => i.id === itemId);
      if (itemIdx === -1) return { data: { success: false, message: 'Item not found' } };
      const cost = 1000;
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === (items[itemIdx].owner_id));
      if (charIdx === -1 || (chars[charIdx].gems || 0) < cost) {
        return { data: { success: false, message: 'Not enough gems' } };
      }
      items[itemIdx].awakened = true;
      chars[charIdx].gems = (chars[charIdx].gems || 0) - cost;
      setStore('Item', items);
      setStore('Character', chars);
      return { data: { success: true, item: items[itemIdx], gems_spent: cost } };
    }

    case 'getShopRotation': {
      const now = new Date();
      const seed = Math.floor(now.getTime() / (6 * 60 * 60 * 1000));
      const shopItems = [
        { id: `shop_${seed}_1`, name: 'Health Potion', type: 'consumable', price: 50, currency: 'gold' },
        { id: `shop_${seed}_2`, name: 'Mana Potion', type: 'consumable', price: 50, currency: 'gold' },
        { id: `shop_${seed}_3`, name: 'Mystery Box', type: 'lootbox', price: 100, currency: 'gems' },
        { id: `shop_${seed}_4`, name: 'EXP Boost', type: 'boost', price: 200, currency: 'gold' },
        { id: `shop_${seed}_5`, name: 'Gold Boost', type: 'boost', price: 150, currency: 'gold' },
      ];
      return { data: { items: shopItems, refreshes_at: new Date((seed + 1) * 6 * 60 * 60 * 1000).toISOString() } };
    }

    case 'manageDailyQuests': {
      const existing = getStore('Quest').filter(q => q.character_id === characterId);
      const activeQuests = existing.filter(q => q.status === 'active');
      if (activeQuests.length >= 3) return { data: { quests: existing } };
      const questTemplates = [
        { title: 'Monster Slayer', description: 'Kill 10 enemies', type: 'daily', target: 10, reward: { gold: 200, exp: 100 } },
        { title: 'Gold Hoarder', description: 'Earn 500 gold', type: 'daily', target: 500, reward: { gold: 300, gems: 1 } },
        { title: 'Level Up', description: 'Gain a level', type: 'daily', target: 1, reward: { gold: 500, gems: 2 } },
      ];
      const quests = getStore('Quest');
      const newQuests = [];
      for (const template of questTemplates.slice(0, 3 - activeQuests.length)) {
        const quest = {
          id: generateId(),
          character_id: characterId,
          type: template.type,
          title: template.title,
          description: template.description,
          target: template.target,
          progress: 0,
          reward: template.reward,
          status: 'active',
          created_date: new Date().toISOString(),
        };
        quests.push(quest);
        newQuests.push(quest);
      }
      setStore('Quest', quests);
      return { data: { quests: [...existing, ...newQuests] } };
    }

    case 'updateQuestProgress': {
      const { questType, amount } = params;
      const quests = getStore('Quest');
      let changed = false;
      for (let i = 0; i < quests.length; i++) {
        if (quests[i].character_id === characterId && quests[i].status === 'active') {
          quests[i].progress = Math.min((quests[i].progress || 0) + (amount || 1), quests[i].target);
          if (quests[i].progress >= quests[i].target) quests[i].status = 'completed';
          changed = true;
        }
      }
      if (changed) setStore('Quest', quests);
      return { data: { success: true } };
    }

    case 'lifeSkills': {
      const { action, skillType } = params;
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { life_skills: {} } };
      const char = chars[charIdx];
      const lifeSkills = char.life_skills || {};
      if (action === 'getState') return { data: { life_skills: lifeSkills } };
      if (action === 'gather' || action === 'craft' || action === 'process') {
        const skill = lifeSkills[skillType] || { level: 1, exp: 0 };
        skill.exp = (skill.exp || 0) + 10;
        if (skill.exp >= skill.level * 100) { skill.level += 1; skill.exp = 0; }
        lifeSkills[skillType] = skill;
        chars[charIdx].life_skills = lifeSkills;
        setStore('Character', chars);
        return { data: { life_skills: lifeSkills, success: true } };
      }
      if (action === 'upgrade') {
        const skill = lifeSkills[skillType] || { level: 1, exp: 0 };
        skill.level += 1;
        lifeSkills[skillType] = skill;
        chars[charIdx].life_skills = lifeSkills;
        setStore('Character', chars);
        return { data: { life_skills: lifeSkills, success: true } };
      }
      return { data: { life_skills: lifeSkills } };
    }

    case 'processGemLab': {
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { gem_lab: { level: 1, gems_stored: 0 }, gems_generated: 0 } };
      const char = chars[charIdx];
      const gemLab = char.gem_lab || { level: 1, gems_stored: 0 };
      const gemsGenerated = gemLab.level || 1;
      gemLab.gems_stored = (gemLab.gems_stored || 0) + gemsGenerated;
      chars[charIdx].gem_lab = gemLab;
      setStore('Character', chars);
      return { data: { gem_lab: gemLab, gems_generated: gemsGenerated } };
    }

    case 'claimGemLabGems': {
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { gems_claimed: 0, gem_lab: { level: 1, gems_stored: 0 } } };
      const char = chars[charIdx];
      const gemLab = char.gem_lab || { level: 1, gems_stored: 0 };
      const gemsToAdd = gemLab.gems_stored || 0;
      gemLab.gems_stored = 0;
      chars[charIdx].gem_lab = gemLab;
      chars[charIdx].gems = (char.gems || 0) + gemsToAdd;
      setStore('Character', chars);
      return { data: { gems_claimed: gemsToAdd, gem_lab: gemLab } };
    }

    case 'upgradeGemLab': {
      const chars = getStore('Character');
      const charIdx = chars.findIndex(c => c.id === characterId);
      if (charIdx === -1) return { data: { success: false, message: 'Character not found' } };
      const char = chars[charIdx];
      const gemLab = char.gem_lab || { level: 1, gems_stored: 0 };
      const cost = gemLab.level * 500;
      if ((char.gold || 0) < cost) return { data: { success: false, message: 'Not enough gold' } };
      gemLab.level = (gemLab.level || 1) + 1;
      chars[charIdx].gem_lab = gemLab;
      chars[charIdx].gold = (char.gold || 0) - cost;
      setStore('Character', chars);
      return { data: { success: true, gem_lab: gemLab, gold_spent: cost } };
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
      const { trade_id, action } = params;
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
      const { action, partyId, targetCharacterId } = params;
      if (action === 'create') {
        const chars = getStore('Character');
        const char = chars.find(c => c.id === characterId);
        const party = {
          id: generateId(),
          leader_id: characterId,
          leader_name: char?.name || 'Unknown',
          members: [{ id: characterId, name: char?.name || 'Unknown' }],
          status: 'active',
          max_members: 4,
          created_date: new Date().toISOString(),
        };
        const parties = getStore('Party');
        parties.push(party);
        setStore('Party', parties);
        notifySubscribers('Party', { type: 'create', id: party.id, data: party });
        return { data: { success: true, party } };
      }
      if (action === 'invite' && partyId && targetCharacterId) {
        const invite = {
          id: generateId(),
          party_id: partyId,
          from_character_id: characterId,
          from_character_name: params.characterName || 'Unknown',
          to_character_id: targetCharacterId,
          status: 'pending',
          created_date: new Date().toISOString(),
        };
        const invites = getStore('PartyInvite');
        invites.push(invite);
        setStore('PartyInvite', invites);
        notifySubscribers('PartyInvite', { type: 'create', id: invite.id, data: invite });
        return { data: { success: true, invite } };
      }
      if (action === 'join' && partyId) {
        const parties = getStore('Party');
        const pIdx = parties.findIndex(p => p.id === partyId);
        if (pIdx === -1) return { data: { success: false, message: 'Party not found' } };
        const members = parties[pIdx].members || [];
        if (members.length >= (parties[pIdx].max_members || 4)) {
          return { data: { success: false, message: 'Party is full' } };
        }
        const chars = getStore('Character');
        const char = chars.find(c => c.id === characterId);
        members.push({ id: characterId, name: char?.name || 'Unknown' });
        parties[pIdx].members = members;
        setStore('Party', parties);
        return { data: { success: true, party: parties[pIdx] } };
      }
      if (action === 'leave' && partyId) {
        const parties = getStore('Party');
        const pIdx = parties.findIndex(p => p.id === partyId);
        if (pIdx !== -1) {
          parties[pIdx].members = (parties[pIdx].members || []).filter(m => m.id !== characterId);
          if (parties[pIdx].members.length === 0) {
            parties.splice(pIdx, 1);
          }
          setStore('Party', parties);
        }
        return { data: { success: true } };
      }
      if (action === 'disband' && partyId) {
        let parties = getStore('Party');
        parties = parties.filter(p => p.id !== partyId);
        setStore('Party', parties);
        return { data: { success: true } };
      }
      return { data: { success: true } };
    }

    case 'processServerProgression':
    case 'catchUpOfflineProgress':
    case 'unifiedPlayerProgression':
      return { data: { success: true } };

    case 'dungeonAction': {
      return { data: { success: true, result: params } };
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

export const base44 = {
  auth: {
    async me() {
      let user = getLocalUser();
      if (!user) {
        user = {
          id: 'local-player',
          email: 'player@local',
          name: 'Player',
          role: 'admin',
        };
        localStorage.setItem('eb_local_user', JSON.stringify(user));
      }
      return user;
    },

    logout() {
      localStorage.removeItem('eb_local_user');
      window.location.reload();
    },

    redirectToLogin() {
      window.location.reload();
    },
  },

  entities,

  functions: {
    async invoke(functionName, params = {}) {
      return handleFunction(functionName, params);
    },
  },
};

export default base44;
