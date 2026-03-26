import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let supabase = null;

function getSupabase() {
  if (!supabase && supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabase;
}

function isEnabled() {
  return !!getSupabase();
}

function snakeKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/([A-Z])/g, "_$1").toLowerCase();
    out[snake] = v;
  }
  return out;
}

export const supabaseSync = {
  isEnabled,

  async ensureUser(userId, email) {
    const sb = getSupabase();
    if (!sb || !userId) return;
    try {
      await sb.from("users").upsert({
        id: userId,
        email: email || userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] user ensure failed:", e.message);
    }
  },

  async syncCharacter(character) {
    const sb = getSupabase();
    if (!sb || !character?.id) return;
    try {
      await this.ensureUser(character.created_by || character.createdBy || "local", character.created_by || character.createdBy);
      const row = {
        id: character.id,
        created_by: character.created_by || character.createdBy || "local",
        name: character.name,
        class: character.class,
        level: character.level || 1,
        exp: character.exp || 0,
        exp_to_next: character.exp_to_next || character.expToNext || 100,
        hp: character.hp || 100,
        max_hp: character.max_hp || character.maxHp || 100,
        mp: character.mp || 50,
        max_mp: character.max_mp || character.maxMp || 50,
        strength: character.strength || 10,
        dexterity: character.dexterity || 10,
        intelligence: character.intelligence || 10,
        vitality: character.vitality || 10,
        luck: character.luck || 5,
        stat_points: character.stat_points || character.statPoints || 0,
        skill_points: character.skill_points || character.skillPoints || 0,
        gold: character.gold || 0,
        gems: character.gems || 0,
        current_region: character.current_region || character.currentRegion || "verdant_forest",
        equipment: character.equipment || {},
        skills: character.skills || [],
        hotbar_skills: character.hotbar_skills || character.hotbarSkills || [],
        idle_mode: character.idle_mode || character.idleMode || false,
        total_kills: character.total_kills || character.totalKills || 0,
        total_damage: character.total_damage || character.totalDamage || 0,
        prestige_level: character.prestige_level || character.prestigeLevel || 0,
        achievements: character.achievements || [],
        daily_quests_completed: character.daily_quests_completed || 0,
        weekly_quests_completed: character.weekly_quests_completed || 0,
        guild_id: character.guild_id || character.guildId || null,
        is_banned: character.is_banned || character.isBanned || false,
        is_muted: character.is_muted || character.isMuted || false,
        title: character.title || null,
        life_skills: character.life_skills || character.lifeSkills || {},
        gem_lab: character.gem_lab || character.gemLab || {},
        daily_login_streak: character.daily_login_streak || character.dailyLoginStreak || 0,
        dungeon_data: character.dungeon_data || character.dungeonData || {},
        skill_tree_data: character.skill_tree_data || character.skillTreeData || {},
        extra_data: character.extra_data || character.extraData || {},
        updated_at: new Date().toISOString(),
      };
      await sb.from("characters").upsert(row, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] character sync failed:", e.message);
    }
  },

  async syncItem(item) {
    const sb = getSupabase();
    if (!sb || !item?.id) return;
    try {
      const row = {
        id: item.id,
        owner_id: item.owner_id || item.ownerId,
        name: item.name,
        type: item.type,
        rarity: item.rarity || "common",
        level: item.level || item.item_level || 1,
        equipped: item.equipped || false,
        stats: item.stats || {},
        set_id: item.set_id || item.setId || null,
        upgrade_level: item.upgrade_level || item.upgradeLevel || 0,
        star_level: item.star_level || item.starLevel || 0,
        awakened: item.awakened || false,
        extra_data: item.extra_data || item.extraData || {},
        updated_at: new Date().toISOString(),
      };
      await sb.from("items").upsert(row, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] item sync failed:", e.message);
    }
  },

  async syncItems(items) {
    const sb = getSupabase();
    if (!sb || !items?.length) return;
    try {
      const rows = items.map(item => ({
        id: item.id,
        owner_id: item.owner_id || item.ownerId,
        name: item.name,
        type: item.type,
        rarity: item.rarity || "common",
        level: item.level || item.item_level || 1,
        equipped: item.equipped || false,
        stats: item.stats || {},
        set_id: item.set_id || item.setId || null,
        upgrade_level: item.upgrade_level || item.upgradeLevel || 0,
        star_level: item.star_level || item.starLevel || 0,
        awakened: item.awakened || false,
        extra_data: item.extra_data || item.extraData || {},
        updated_at: new Date().toISOString(),
      }));
      await sb.from("items").upsert(rows, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] items bulk sync failed:", e.message);
    }
  },

  async syncQuest(quest) {
    const sb = getSupabase();
    if (!sb || !quest?.id) return;
    try {
      const row = {
        id: quest.id,
        character_id: quest.character_id || quest.characterId,
        type: quest.type || "daily",
        title: quest.title,
        description: quest.description || "",
        objective: quest.objective || {},
        progress: quest.progress || quest.current_count || 0,
        target: quest.target || quest.target_count || 1,
        reward: quest.reward || quest.rewards || {},
        status: quest.status || "active",
        updated_at: new Date().toISOString(),
      };
      await sb.from("quests").upsert(row, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] quest sync failed:", e.message);
    }
  },

  async syncResource(resource) {
    const sb = getSupabase();
    if (!sb || !resource?.id) return;
    try {
      const row = {
        id: resource.id,
        character_id: resource.character_id || resource.characterId,
        type: resource.type || resource.resource_type || "unknown",
        name: resource.name || resource.rarity || "common",
        quantity: resource.quantity || 0,
        extra_data: resource.extra_data || {},
        updated_at: new Date().toISOString(),
      };
      await sb.from("resources").upsert(row, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] resource sync failed:", e.message);
    }
  },

  async deleteItem(itemId) {
    const sb = getSupabase();
    if (!sb || !itemId) return;
    try {
      await sb.from("items").delete().eq("id", itemId);
    } catch (e) {
      console.warn("[supabaseSync] item delete failed:", e.message);
    }
  },

  async storeTimestamp(characterId, key, value) {
    const sb = getSupabase();
    if (!sb || !characterId || !key) return;
    try {
      await sb.from("game_config").upsert({
        id: `${characterId}_${key}`,
        key,
        value: JSON.stringify({ ts: value, character_id: characterId }),
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] storeTimestamp failed:", e.message);
    }
  },

  async getTimestamp(characterId, key) {
    const sb = getSupabase();
    if (!sb || !characterId || !key) return null;
    try {
      const { data } = await sb.from("game_config")
        .select("value")
        .eq("id", `${characterId}_${key}`)
        .single();
      if (data?.value) {
        const parsed = JSON.parse(data.value);
        return parsed.ts || null;
      }
      return null;
    } catch {
      return null;
    }
  },

  async validateElapsed(characterId, key, minElapsedMs) {
    const serverTs = await this.getTimestamp(characterId, key);
    if (!serverTs) return { valid: true, elapsed: Infinity };
    const elapsed = Date.now() - serverTs;
    return { valid: elapsed >= minElapsedMs, elapsed };
  },

  async syncGemLab(lab) {
    const sb = getSupabase();
    if (!sb || !lab?.id) return;
    try {
      await sb.from("gem_labs").upsert({
        id: lab.id,
        character_id: lab.character_id,
        production_level: lab.production_level || 0,
        speed_level: lab.speed_level || 0,
        efficiency_level: lab.efficiency_level || 0,
        pending_gems: lab.pending_gems || 0,
        total_gems_generated: lab.total_gems_generated || 0,
        last_collection_time: lab.last_collection_time || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch (e) {
      console.warn("[supabaseSync] gemLab sync failed:", e.message);
    }
  },

  async getBossAttackCount(characterId) {
    const sb = getSupabase();
    if (!sb || !characterId) return null;
    try {
      const { data, error } = await sb
        .from("game_config")
        .select("value")
        .eq("character_id", characterId)
        .eq("key", "guild_boss_attack_window")
        .single();
      if (error || !data) return null;
      return JSON.parse(data.value);
    } catch { return null; }
  },

  async recordBossAttack(characterId) {
    const sb = getSupabase();
    if (!sb || !characterId) return;
    const WINDOW_MS = 8 * 60 * 60 * 1000;
    try {
      let existing = await this.getBossAttackCount(characterId);
      const now = Date.now();
      if (!existing || now - (existing.windowStart || 0) >= WINDOW_MS) {
        existing = { windowStart: now, count: 0 };
      }
      existing.count += 1;
      await sb.from("game_config").upsert({
        character_id: characterId,
        key: "guild_boss_attack_window",
        value: JSON.stringify(existing),
        updated_at: new Date().toISOString(),
      }, { onConflict: "character_id,key" });
    } catch (e) {
      console.warn("[supabaseSync] recordBossAttack failed:", e.message);
    }
  },

  async validateBossAttackLimit(characterId) {
    const sb = getSupabase();
    if (!sb || !characterId) return { valid: true };
    const WINDOW_MS = 8 * 60 * 60 * 1000;
    const MAX_ATTACKS = 10;
    try {
      const data = await this.getBossAttackCount(characterId);
      if (!data) return { valid: true, attacksUsed: 0, attacksLeft: MAX_ATTACKS };
      const now = Date.now();
      if (now - (data.windowStart || 0) >= WINDOW_MS) {
        return { valid: true, attacksUsed: 0, attacksLeft: MAX_ATTACKS };
      }
      const attacksLeft = Math.max(0, MAX_ATTACKS - (data.count || 0));
      return {
        valid: attacksLeft > 0,
        attacksUsed: data.count || 0,
        attacksLeft,
        windowRemaining: WINDOW_MS - (now - data.windowStart),
      };
    } catch {
      return { valid: true };
    }
  },

  async fetchAllServerPlayers() {
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from("characters")
        .select("id, name, class, level, gold, gems, hp, max_hp, total_kills, total_damage, current_region, created_by, is_banned, title, prestige_level, equipment, updated_at")
        .order("level", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("[supabaseSync] fetchAllServerPlayers failed:", e.message);
      return [];
    }
  },

  async fetchPlayerByName(name) {
    const sb = getSupabase();
    if (!sb || !name) return null;
    try {
      const { data, error } = await sb
        .from("characters")
        .select("id, name, class, level, current_region")
        .ilike("name", name)
        .limit(1);
      if (error || !data?.length) return null;
      return data[0];
    } catch { return null; }
  },

  async createParty(characterId, charName, charClass, charLevel) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from("parties").insert({
        leader_id: characterId,
        leader_name: charName,
        members: [{ character_id: characterId, name: charName, class: charClass, level: charLevel }],
        max_members: 6,
        status: "open",
      }).select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("[supabaseSync] createParty failed:", e.message);
      return null;
    }
  },

  async getPartyForCharacter(characterId) {
    const sb = getSupabase();
    if (!sb || !characterId) return null;
    try {
      const { data: led } = await sb.from("parties")
        .select("*")
        .eq("leader_id", characterId)
        .neq("status", "disbanded")
        .limit(1);
      if (led?.length) return led[0];

      const { data: memberOf } = await sb.from("parties")
        .select("*")
        .neq("status", "disbanded")
        .contains("members", JSON.stringify([{ character_id: characterId }]))
        .limit(1);
      return memberOf?.length ? memberOf[0] : null;
    } catch (e) {
      console.warn("[supabaseSync] getPartyForCharacter failed:", e.message);
      return null;
    }
  },

  async updateParty(partyId, updates) {
    const sb = getSupabase();
    if (!sb || !partyId) return null;
    try {
      const { data, error } = await sb.from("parties")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", partyId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("[supabaseSync] updateParty failed:", e.message);
      return null;
    }
  },

  async createPartyInvite(partyId, fromCharId, fromName, toCharId) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from("party_invites").insert({
        party_id: partyId,
        from_character_id: fromCharId,
        from_character_name: fromName,
        to_character_id: toCharId,
        status: "pending",
      }).select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("[supabaseSync] createPartyInvite failed:", e.message);
      return null;
    }
  },

  async getPendingInvites(characterId) {
    const sb = getSupabase();
    if (!sb || !characterId) return [];
    try {
      const { data, error } = await sb.from("party_invites")
        .select("*")
        .eq("to_character_id", characterId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(inv => ({
        ...inv,
        from_name: inv.from_character_name,
      }));
    } catch (e) {
      console.warn("[supabaseSync] getPendingInvites failed:", e.message);
      return [];
    }
  },

  async updateInviteStatus(inviteId, status) {
    const sb = getSupabase();
    if (!sb || !inviteId) return null;
    try {
      const { data, error } = await sb.from("party_invites")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", inviteId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("[supabaseSync] updateInviteStatus failed:", e.message);
      return null;
    }
  },

  async getInviteById(inviteId) {
    const sb = getSupabase();
    if (!sb || !inviteId) return null;
    try {
      const { data, error } = await sb.from("party_invites")
        .select("*")
        .eq("id", inviteId)
        .single();
      if (error) throw error;
      return data;
    } catch { return null; }
  },

  async getPartyById(partyId) {
    const sb = getSupabase();
    if (!sb || !partyId) return null;
    try {
      const { data, error } = await sb.from("parties")
        .select("*")
        .eq("id", partyId)
        .single();
      if (error) throw error;
      return data;
    } catch { return null; }
  },

  async getCharacterById(characterId) {
    const sb = getSupabase();
    if (!sb || !characterId) return null;
    try {
      const { data, error } = await sb.from("characters")
        .select("id, name, class, level, current_region")
        .eq("id", characterId)
        .single();
      if (error) return null;
      return data;
    } catch { return null; }
  },

  async fullSync(characterId) {
    const sb = getSupabase();
    if (!sb || !characterId) return { synced: false };

    try {
      const charKey = "eb_Character";
      const itemKey = "eb_Item";
      const questKey = "eb_Quest";
      const resourceKey = "eb_Resource";

      const chars = JSON.parse(localStorage.getItem(charKey) || "[]");
      const char = chars.find(c => c.id === characterId);
      if (char) await this.syncCharacter(char);

      const items = JSON.parse(localStorage.getItem(itemKey) || "[]");
      const charItems = items.filter(i => i.owner_id === characterId);
      if (charItems.length) await this.syncItems(charItems);

      const quests = JSON.parse(localStorage.getItem(questKey) || "[]");
      const charQuests = quests.filter(q => q.character_id === characterId);
      for (const q of charQuests) await this.syncQuest(q);

      const resources = JSON.parse(localStorage.getItem(resourceKey) || "[]");
      const charResources = resources.filter(r => r.character_id === characterId);
      for (const r of charResources) await this.syncResource(r);

      const gemLabs = JSON.parse(localStorage.getItem("eb_GemLab") || "[]");
      const charLab = gemLabs.find(l => l.character_id === characterId);
      if (charLab) await this.syncGemLab(charLab);

      return {
        synced: true,
        character: !!char,
        items: charItems.length,
        quests: charQuests.length,
        resources: charResources.length,
        gemLab: !!charLab,
      };
    } catch (e) {
      console.warn("[supabaseSync] full sync failed:", e.message);
      return { synced: false, error: e.message };
    }
  },
};

export default supabaseSync;
