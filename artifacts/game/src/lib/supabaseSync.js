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

      return {
        synced: true,
        character: !!char,
        items: charItems.length,
        quests: charQuests.length,
        resources: charResources.length,
      };
    } catch (e) {
      console.warn("[supabaseSync] full sync failed:", e.message);
      return { synced: false, error: e.message };
    }
  },
};

export default supabaseSync;
