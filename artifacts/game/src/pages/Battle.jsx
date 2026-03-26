import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import WelcomeBackModal from "@/components/game/WelcomeBackModal";
import {
  Swords, Skull, Sparkles, Heart,
  Shield, Zap,
  ShieldCheck, Crown, Footprints, CircleDot, Gem, FlaskConical, Package, Play, Pause
} from "lucide-react";

const LOOT_TYPE_ICONS = {
  weapon: Swords, armor: ShieldCheck, helmet: Crown,
  boots: Footprints, ring: CircleDot, amulet: Gem,
  consumable: FlaskConical, material: Package,
};

import HealthBar from "@/components/game/HealthBar";
import AttackVisual from "@/components/game/AttackVisual";
import PartyBattlePanel from "@/components/game/PartyBattlePanel";
import PartyBattleArena from "@/components/game/PartyBattleArena";
import PartyActivityNotifier from "@/components/game/PartyActivityNotifier";
import PartyActivityDisplay from "@/components/game/PartyActivityDisplay";
import { useFloatingNumbers } from "@/components/game/FloatingNumbers";
import { REGIONS, ENEMIES, SKILLS, CLASSES, calculateExpToLevel, generateLoot, RARITY_CONFIG } from "@/lib/gameData";
import { CLASS_SKILLS, ELEMENT_CONFIG } from "@/lib/skillData";
import { rollDamage, calculateDamageTaken, calculateFinalStats } from "@/lib/statSystem";
import hybridPersistence from "@/lib/hybridPersistence";

const RARE_RARITIES = ["legendary", "mythic", "shiny"];

// HP/MP regen per turn (as % of max)
const HP_REGEN_PER_TURN = 0.03; // 3%
const MP_REGEN_PER_TURN = 0.05; // 5%

export default function Battle({ character, onCharacterUpdate }) {
  const [partyData, setPartyData] = useState(null);
  const [enemy, setEnemy] = useState(null);
  const [enemyHp, setEnemyHp] = useState(0);
  const [playerHp, setPlayerHp] = useState(character?.max_hp || 100);
  const [playerMp, setPlayerMp] = useState(character?.max_mp || 50);
  const [isIdle, setIsIdle] = useState(character?.idle_mode || false);
  const [battleLog, setBattleLog] = useState([]);
  // Turn-based cooldowns (in turns remaining)
  const [cooldowns, setCooldowns] = useState({});
  const [lootDrop, setLootDrop] = useState(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [combatPhase, setCombatPhase] = useState("idle"); // idle | player_turn | enemy_turn | enemy_dead | player_dead
  const [showAttackVisual, setShowAttackVisual] = useState(false);
  const [lastAttackIsSkill, setLastAttackIsSkill] = useState(false);
  const [lastSkillId, setLastSkillId] = useState(null);
  const [lastDamage, setLastDamage] = useState(null);
  const [lastIsCrit, setLastIsCrit] = useState(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [welcomeBackRewards, setWelcomeBackRewards] = useState(null);
  const [welcomeBackHours, setWelcomeBackHours] = useState(0);
  const [playerShake, setPlayerShake] = useState(false);
  const [enemyShake, setEnemyShake] = useState(false);
  const [playerAttackNudge, setPlayerAttackNudge] = useState(false);
  const [enemyAttackNudge, setEnemyAttackNudge] = useState(false);
  const { spawn: spawnPlayerNum, node: playerNumNode } = useFloatingNumbers();
  const { spawn: spawnEnemyNum, node: enemyNumNode } = useFloatingNumbers();
  // Auto-attack timer (5s)
  const [autoAttackCountdown, setAutoAttackCountdown] = useState(null);
  const autoAttackTimerRef = useRef(null);
  const offlineProcessedRef = useRef(false);

  const queryClient = useQueryClient();
  const region = REGIONS[character?.current_region || "verdant_forest"];
  const charClass = CLASSES[character?.class || "warrior"];

  // Use hotbar skills (user-selected up to 6) for battle — fall back to all learned if no hotbar set
  const allClassSkills = CLASS_SKILLS[character?.class || "warrior"] || [];
  const hotbarIds = character?.hotbar_skills?.length > 0
    ? character.hotbar_skills
    : (character?.skills || []);
  const charSkills = hotbarIds
    .map(sid => allClassSkills.find(s => s.id === sid))
    .filter(Boolean)
    .slice(0, 6);

  // Party bonus: +5% EXP and gold per additional member ONLY IF SAME MAP
  const sameMapMembers = partyData?.members?.filter(m => m.character_id === character.id || m.current_zone === character.current_region) || [];
  const partySize = sameMapMembers.length || 1;
  const partyBonus = Math.max(0, partySize - 1) * 0.05;

  const { data: allItems = [] } = useQuery({
    queryKey: ["items", character?.id],
    queryFn: () => base44.entities.Item.filter({ owner_id: character?.id }),
    enabled: !!character?.id,
  });

  const potionStacks = allItems
    .filter(i => i.type === "consumable" && i.name.toLowerCase().includes("health"))
    .reduce((acc, item) => {
      const key = item.name;
      if (!acc[key]) acc[key] = { ...item, count: 0, ids: [] };
      acc[key].count++;
      acc[key].ids.push(item.id);
      return acc;
    }, {});
  const potionGroups = Object.values(potionStacks);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.Character.update(character.id, data),
    onSuccess: (data) => onCharacterUpdate(data),
  });

  const lootMutation = useMutation({
    mutationFn: (item) => base44.entities.Item.create({ ...item, owner_id: character.id }),
  });

  const usePotionMutation = useMutation({
    mutationFn: async (stack) => {
      const idToUse = stack.ids[0];
      const healAmount = stack.stats?.hp_bonus || 50;
      const newHp = Math.min(character.max_hp, playerHp + healAmount);
      await base44.entities.Item.delete(idToUse);
      setPlayerHp(newHp);
      addLog(`🧪 Used ${stack.name}! Restored ${healAmount} HP.`);
      queryClient.invalidateQueries({ queryKey: ["items", character.id] });
    },
  });

  const addLog = (msg) => setBattleLog(prev => [msg, ...prev.slice(0, 29)]);

  const spawnEnemy = useCallback(() => {
    if (!region) return;
    // Elite spawn: 1.5% each for eliteEnemy and eliteEnemy2
    const eliteRoll = Math.random();
    let key;
    let isEliteSpawn = false;
    if (region.eliteEnemy && eliteRoll < 0.015) {
      key = region.eliteEnemy;
      isEliteSpawn = true;
    } else if (region.eliteEnemy2 && eliteRoll < 0.03) {
      key = region.eliteEnemy2;
      isEliteSpawn = true;
    } else {
      key = region.enemies[Math.floor(Math.random() * region.enemies.length)];
    }
    const enemyData = ENEMIES[key];
    if (!enemyData) return;
    const lvlScale = 1 + (character.level - 1) * 0.1;
    const hp = Math.floor(enemyData.baseHp * lvlScale);
    setEnemy({ ...enemyData, key, maxHp: hp, dmg: Math.floor(enemyData.baseDmg * lvlScale) });
    setEnemyHp(hp);
    setLootDrop(null);
    setCombatPhase("player_turn");
    setIsPlayerTurn(true);
    if (isEliteSpawn) addLog(`⚡ ELITE appeared: ${enemyData.name}! Rare loot bonus!`);
  }, [region, character?.level]);

  // ── ENEMY TURN ────────────────────────────────────────────────────────────
  const doEnemyTurn = useCallback((currentPlayerHp, currentEnemyData) => {
    if (!currentEnemyData) return;
    const equipped = allItems.filter(i => i.equipped);
    const { derived: d } = calculateFinalStats(character, equipped);
    const rawEnemyDmg = Math.floor(currentEnemyData.dmg * (0.8 + Math.random() * 0.4));
    const { finalDamage: actualDmg, evaded, blocked } = calculateDamageTaken(rawEnemyDmg, d, currentEnemyData.level || 1, character.level);

    const newPlayerHp = Math.max(0, currentPlayerHp - actualDmg);
    setPlayerHp(newPlayerHp);

    const prefix = evaded ? "🌀 Evaded! " : blocked ? "🛡️ Blocked! " : "";
    addLog(`${prefix}${currentEnemyData.name} attacks for ${actualDmg} damage!`);

    // Enemy nudges, player shakes on hit
    setEnemyAttackNudge(true);
    setTimeout(() => setEnemyAttackNudge(false), 300);
    setTimeout(() => {
      setPlayerShake(true);
      setTimeout(() => setPlayerShake(false), 350);
    }, 150);

    // Floating numbers on player side
    if (!evaded) spawnPlayerNum(actualDmg, "damage");

    // Regen at end of enemy turn
    const mpRegen = Math.floor(character.max_mp * MP_REGEN_PER_TURN);
    setPlayerMp(prev => {
      const next = Math.min(character.max_mp, prev + mpRegen);
      if (mpRegen > 0) spawnPlayerNum(mpRegen, "mp_regen");
      return next;
    });
    // Tick down cooldowns
    setCooldowns(prev => {
      const next = {};
      for (const [k, v] of Object.entries(prev)) { if (v > 0) next[k] = v - 1; }
      return next;
    });

    if (newPlayerHp <= 0) {
      addLog("💀 You were defeated! Respawning...");
      setCombatPhase("player_dead");
      setTimeout(() => {
        setPlayerHp(character.max_hp);
        setPlayerMp(character.max_mp);
        spawnEnemy();
      }, 2000);
    } else {
      setCombatPhase("player_turn");
      setIsPlayerTurn(true);
    }
  }, [allItems, character, spawnEnemy]);

  // ── PLAYER ATTACK ─────────────────────────────────────────────────────────
  const doPlayerAttack = useCallback((skill = null) => {
    if (combatPhase !== "player_turn" || !enemy || enemyHp <= 0) return;
    if (skill && (cooldowns[skill.id] > 0 || playerMp < skill.mp)) return;

    // Clear auto-attack timer
    if (autoAttackTimerRef.current) {
      clearInterval(autoAttackTimerRef.current);
      autoAttackTimerRef.current = null;
    }
    setAutoAttackCountdown(null);

    setCombatPhase("enemy_turn");
    setIsPlayerTurn(false);

    const equipped = allItems.filter(i => i.equipped);
    const { total, derived } = calculateFinalStats(character, equipped);
    const { damage, isCrit } = rollDamage(total, character.class, skill || undefined, character);

    let finalDmg = damage;
    if (skill) {
      if (skill.damage > 0) finalDmg = Math.floor(damage * (skill.damage || 1.5));
      setPlayerMp(prev => prev - skill.mp);
      setCooldowns(prev => ({ ...prev, [skill.id]: skill.cooldown || 3 }));
    }

    // Lifesteal
    const lifestealAmount = Math.max(0, Math.round(finalDmg * (derived.lifesteal / 100)));
    const regenHp = Math.floor(character.max_hp * HP_REGEN_PER_TURN);
    const newPlayerHp = Math.min(character.max_hp, playerHp + lifestealAmount + regenHp);
    setPlayerHp(newPlayerHp);

    const newEnemyHp = Math.max(0, enemyHp - finalDmg);
    setEnemyHp(newEnemyHp);

    setLastDamage(finalDmg);
    setLastIsCrit(isCrit);
    setLastAttackIsSkill(!!skill);
    setLastSkillId(skill?.id || null);
    setShowAttackVisual(true);
    setTimeout(() => setShowAttackVisual(false), 600);

    // Player nudges forward, enemy shakes on hit
    setPlayerAttackNudge(true);
    setTimeout(() => setPlayerAttackNudge(false), 300);
    setTimeout(() => {
      setEnemyShake(true);
      setTimeout(() => setEnemyShake(false), isCrit ? 600 : 350);
    }, 150);

    // Floating numbers on enemy side
    spawnEnemyNum(finalDmg, isCrit ? "crit" : "damage");
    if (lifestealAmount > 0) spawnPlayerNum(lifestealAmount, "heal");
    if (regenHp > 0) spawnPlayerNum(regenHp, "heal");
    if (skill?.mp) spawnPlayerNum(skill.mp, "mp_use");

    // Pickpocket: steal gold
    let pickpocketGold = 0;
    if (skill?.special === "pickpocket") {
      pickpocketGold = Math.floor(100 + Math.random() * 400);
      const newGold = (character.gold || 0) + pickpocketGold;
      saveMutation.mutate({ gold: newGold });
      addLog(`💰 Pickpocket! Stole ${pickpocketGold} gold from the enemy!`);
    }

    const skillLabel = skill ? `⚡ ${skill.name}` : "⚔️ Attack";
    addLog(`${isCrit ? "💥 CRIT! " : ""}${skillLabel} → ${finalDmg} dmg${lifestealAmount > 0 ? ` (❤️+${lifestealAmount})` : ""}${regenHp > 0 ? ` | HP +${regenHp}` : ""}`);

    // Broadcast party attack to party members
    if (partyData?.id) {
      base44.entities.PartyActivity.create({
        party_id: partyData.id,
        character_id: character.id,
        character_name: character.name,
        activity_type: "enter_zone",
        payload: { 
          battle_action: true,
          skill_name: skill?.name || "Basic Attack",
          damage: finalDmg,
          is_crit: isCrit,
          enemy_name: enemy?.name,
          zone: character.current_region,
          zone_name: `${character.name} attacked ${enemy?.name} for ${finalDmg}${isCrit ? " (CRIT)" : ""}!`
        },
        expires_at: new Date(Date.now() + 15000).toISOString(),
      }).catch(() => {});
      
      // Update presence to show in combat
      base44.entities.Presence.filter({ character_id: character.id }).then(presence => {
        if (presence[0]) {
          base44.entities.Presence.update(presence[0].id, { status: "in_combat", current_zone: character.current_region });
        }
      }).catch(() => {});
    }

    if (newEnemyHp <= 0) {
      handleEnemyDefeat();
      return;
    }

    // Enemy acts after short delay
    setTimeout(() => doEnemyTurn(newPlayerHp, enemy), 1500);
  }, [combatPhase, enemy, enemyHp, playerHp, playerMp, allItems, character, cooldowns, doEnemyTurn]);

  const handleEnemyDefeat = useCallback(async () => {
    if (!enemy || !character) return;
    setCombatPhase("enemy_dead");

    try {
      const response = await base44.functions.invoke('fight', {
        characterId: character.id,
        enemyKey: enemy.key,
        regionKey: character.current_region,
        isElite: enemy.isElite || false,
        isBoss: enemy.isBoss || false,
        partySize: partySize,
        _fallbackCharacter: character,
      });

      const result = response?.data;
      if (!result?.success) {
        console.error('[handleEnemyDefeat] Fight failed:', result);
        addLog(`⚠️ Error processing rewards: ${result?.error || 'unknown'}`);
        setTimeout(() => spawnEnemy(), 2500);
        return;
      }

      const { rewards, character: updatedChar, levelsGained, loot } = result;

      if (levelsGained?.length > 0) {
        levelsGained.forEach(lv => addLog(`🎉 LEVEL UP! You are now level ${lv}!`));
      }

      if (loot) {
        setLootDrop(loot);
        const isRareDrop = RARE_RARITIES.includes(loot.rarity);
        const lootEmoji = loot.rarity === "shiny" ? "🌟" : loot.rarity === "mythic" ? "💎" : loot.rarity === "legendary" ? "🏆" : "✨";
        addLog(`${isRareDrop ? `${lootEmoji}${lootEmoji} ` : ""}${lootEmoji} ${isRareDrop ? "[" + loot.rarity.toUpperCase() + "] " : ""}${loot.name}${isRareDrop ? " DROP!" : ` (${loot.rarity})`}`);
        queryClient.invalidateQueries({ queryKey: ["items", character.id] });
      }

      addLog(`⚔️ Defeated ${enemy.name}! +${rewards.exp} EXP +${rewards.gold} Gold`);

      onCharacterUpdate(updatedChar);

      queryClient.invalidateQueries({ queryKey: ["quests", character.id] });
    } catch (err) {
      console.error('Fight error:', err);
      addLog(`⚠️ Error: ${err.message || 'Unknown error'}`);
    }

    setTimeout(() => spawnEnemy(), 2500);
  }, [enemy, character, partySize, queryClient, spawnEnemy]);

  // ── AUTO-ATTACK TIMER (5s in player turn) ────────────────────────────────
  useEffect(() => {
    if (combatPhase !== "player_turn" || !enemy || enemyHp <= 0) {
      if (autoAttackTimerRef.current) { clearInterval(autoAttackTimerRef.current); autoAttackTimerRef.current = null; }
      setAutoAttackCountdown(null);
      return;
    }

    setAutoAttackCountdown(5);
    autoAttackTimerRef.current = setInterval(() => {
      setAutoAttackCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(autoAttackTimerRef.current);
          autoAttackTimerRef.current = null;
          doPlayerAttack(null); // auto basic attack
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (autoAttackTimerRef.current) clearInterval(autoAttackTimerRef.current); };
  }, [combatPhase, enemy?.key, enemyHp]);

  // ── IDLE AUTO-BATTLE: pick random usable skill or basic attack ───────────
  useEffect(() => {
    if (!isIdle || combatPhase !== "player_turn" || !enemy || enemyHp <= 0) return;
    const t = setTimeout(() => {
      // Try to use a random usable skill
      const usable = charSkills.filter(s =>
        (cooldowns[s.id] || 0) === 0 && playerMp >= s.mp
      );
      if (usable.length > 0) {
        const pick = usable[Math.floor(Math.random() * usable.length)];
        doPlayerAttack(pick);
      } else {
        doPlayerAttack(null);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [isIdle, combatPhase, enemy?.key, enemyHp, cooldowns, playerMp]);

  // Sync progression on mount and periodically
  useEffect(() => {
    if (!character?.id) return;
    const syncProgression = async () => {
      try {
        const response = await base44.functions.invoke('processServerProgression', {
          characterId: character.id,
          action: 'sync_progression',
        });
        if (response.data?.success) {
          const { exp_gained, gems_gained, offline_minutes, resources_gained } = response.data.results;
          // Apply offline rewards
          if (offline_minutes > 0) {
            const newExp = (character.exp || 0) + exp_gained;
            const newGems = (character.gems || 0) + gems_gained;
            onCharacterUpdate({ exp: newExp, gems: newGems });
            if (offline_minutes > 5) {
              addLog(`🌟 Offline for ${offline_minutes}m: +${exp_gained} EXP, +${gems_gained} Gems`);
            }
          }
        }
      } catch {}
    };

    // Sync on mount
    syncProgression();

    // Sync every 60 seconds
    const interval = setInterval(syncProgression, 60000);
    return () => clearInterval(interval);
  }, [character?.id]);

  // Spawn first enemy or restore combat state
  useEffect(() => {
    if (!character?.id) return;
    
    const restoreCombat = async () => {
      try {
        // Check local cache first (faster, for immediate restore on reload)
        const localCombat = hybridPersistence.loadCombat(character.id);
        if (localCombat?.combatState) {
          const cs = localCombat.combatState;
          const enemyData = ENEMIES[cs.enemy_key];
          if (enemyData) {
            setEnemy({ ...enemyData, key: cs.enemy_key, maxHp: cs.enemy_max_hp });
            setEnemyHp(cs.enemy_hp);
            setPlayerHp(cs.player_hp);
            setPlayerMp(cs.player_mp);
            setCombatPhase(cs.phase || 'player_turn');
            setIsPlayerTurn(cs.phase === 'player_turn');
            addLog('⚔️ Combat resumed (local cache)!');
            return;
          }
        }

        // Fallback: check server PlayerSession
        const sessions = await base44.entities.PlayerSession.filter({ character_id: character.id });
        const session = sessions[0];

        if (session?.combat_active && session.combat_state) {
          const cs = session.combat_state;
          const enemyData = ENEMIES[cs.enemy_key];
          if (enemyData) {
            setEnemy({ ...enemyData, key: cs.enemy_key, maxHp: cs.enemy_max_hp });
            setEnemyHp(cs.enemy_hp);
            setPlayerHp(cs.player_hp);
            setPlayerMp(cs.player_mp);
            setCombatPhase(cs.phase || 'player_turn');
            setIsPlayerTurn(cs.phase === 'player_turn');
            addLog('⚔️ Combat resumed from server!');
            return;
          }
        }
      } catch {}

      // No saved combat, spawn new enemy
      spawnEnemy();
    };

    // Only restore if enemy hasn't been set yet
    if (!enemy) {
      restoreCombat();
    }
  }, [character?.id, enemy]);

  // Initialize and update Presence with combat status
  useEffect(() => {
    if (!character?.id) return;
    const updatePresence = async () => {
      try {
        const existing = await base44.entities.Presence.filter({ character_id: character.id });
        const presence = existing[0];
        const statusToSet = isIdle ? "idle" : combatPhase === "player_dead" ? "online" : "in_combat";
        if (presence) {
          base44.entities.Presence.update(presence.id, {
            status: statusToSet,
            current_zone: character.current_region,
            character_level: character.level,
          }).catch(() => {});
        } else {
          base44.entities.Presence.create({
            character_id: character.id,
            character_name: character.name,
            character_class: character.class,
            character_level: character.level,
            status: statusToSet,
            current_zone: character.current_region,
          }).catch(() => {});
        }
      } catch {}
    };
    updatePresence();
  }, [character?.id, character?.level, character.current_region, isIdle, combatPhase]);

  // Sync from props
  useEffect(() => {
    setPlayerHp(character?.hp || character?.max_hp || 100);
    setPlayerMp(character?.mp || character?.max_mp || 50);
  }, [character?.max_hp, character?.max_mp]);

  // Load party data
  useEffect(() => {
    if (!character?.id) return;
    const load = async () => {
      try {
        const led = await base44.entities.Party.filter({ leader_id: character.id });
        const active = led.find(p => p.status !== 'disbanded');
        if (active) { setPartyData(active); return; }
        const all = await base44.entities.Party.list('-updated_date', 50);
        const found = all.find(p => p.status !== 'disbanded' && p.members?.some(m => m.character_id === character.id));
        setPartyData(found || null);
      } catch {}
    };
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [character?.id]);

  // Offline progress catch-up on login
  useEffect(() => {
    if (!character?.id || offlineProcessedRef.current) return;
    offlineProcessedRef.current = true;
    const run = async () => {
      try {
        const response = await base44.functions.invoke('catchUpOfflineProgress', { characterId: character.id });
        if (response.data?.success && response.data.hours_offline > 0) {
          const results = response.data.results;
          let totalGems = 0;
          if (results.gemLab) {
            totalGems = results.gemLab.gems_gained || 0;
          }
          setWelcomeBackRewards({
            gold: 0,
            gems: totalGems,
            lifeSkills: results.lifeSkills,
          });
          setWelcomeBackHours(parseFloat(response.data.hours_offline));
          setShowWelcomeBack(true);
          if (totalGems > 0) {
            onCharacterUpdate({ gems: (character.gems || 0) + totalGems });
          }
        }
      } catch (error) {
        console.error('Catch-up error:', error);
      }
    };
    run();
  }, [character?.id]);

  const toggleIdle = () => {
    const newVal = !isIdle;
    setIsIdle(newVal);
    saveMutation.mutate({ idle_mode: newVal, last_idle_claim: new Date().toISOString() });
  };

  if (!character) return null;

  const isMyTurn = combatPhase === "player_turn";

  // Save combat state before leaving (BOTH local + server)
  useEffect(() => {
    const saveCombatState = async () => {
      if (!character?.id || combatPhase === 'idle' || !enemy) return;
      
      const state = {
        enemy_key: enemy.key,
        enemy_hp: enemyHp,
        enemy_max_hp: enemy.maxHp,
        player_hp: playerHp,
        player_mp: playerMp,
        phase: combatPhase,
      };

      // Save locally for instant restore on reload
      hybridPersistence.saveCombat(character.id, state);

      // Also save to server
      try {
        await base44.functions.invoke('processServerProgression', {
          characterId: character.id,
          action: 'save_combat',
          ...state,
        });
      } catch {}
    };

    window.addEventListener('beforeunload', saveCombatState);
    return () => window.removeEventListener('beforeunload', saveCombatState);
  }, [character?.id, combatPhase, enemy, enemyHp, playerHp, playerMp]);

  const handleJoinZone = async (zone) => {
    if (!zone || !character?.id) return;
    const region = REGIONS[zone];
    if (!region) return;
    if (character.level < region.levelRange[0]) return;
    const updated = await base44.entities.Character.update(character.id, { current_region: zone });
    onCharacterUpdate(updated);
    addLog(`🗺️ Followed party to ${region.name}!`);
  };

  return (
    <>
    <PartyActivityNotifier
      character={character}
      partyId={partyData?.id}
      onJoinZone={handleJoinZone}
    />
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-orbitron text-xl font-bold">{region?.name || "Unknown"}</h2>
          <p className="text-xs text-muted-foreground">Level {region?.levelRange?.[0]}–{region?.levelRange?.[1]}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Turn indicator */}
          <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full border ${
            isMyTurn ? "bg-primary/20 text-primary border-primary/30" : "bg-orange-500/20 text-orange-400 border-orange-500/30"
          }`}>
            {isMyTurn ? "⚔️ YOUR TURN" : "🐉 ENEMY TURN"}
          </div>
          {/* Auto-attack countdown */}
          {isMyTurn && autoAttackCountdown !== null && (
            <div className={`text-xs font-bold px-2 py-1 rounded-full border ${
              autoAttackCountdown <= 2 ? "bg-destructive/20 text-destructive border-destructive/30 animate-pulse" : "bg-muted text-muted-foreground border-border"
            }`}>
              Auto: {autoAttackCountdown}s
            </div>
          )}
          <Button variant={isIdle ? "default" : "outline"} size="sm" onClick={toggleIdle} className="gap-2">
            {isIdle ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isIdle ? "Auto ON" : "Auto OFF"}
          </Button>
        </div>
      </div>

      {/* Party Activity Display — shows members, zones, and activities */}
      {partyData && (
        <PartyActivityDisplay
          partyMembers={partyData.members}
          currentZone={character.current_region}
        />
      )}

      {/* Party members in same zone — shown above the battle arena */}
      {partyData && (
        <div>
          <PartyBattleArena
            party={partyData}
            selfId={character.id}
            selfZone={character.current_region}
          />
        </div>
      )}

      {/* Battle Arena */}
      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
        {/* Player */}
        <motion.div
          animate={
            playerShake
              ? { x: [-6, 6, -5, 5, -3, 3, 0], transition: { duration: 0.35, ease: "easeOut" } }
              : playerAttackNudge
                ? { x: [0, 18, 0], transition: { duration: 0.25, ease: "easeOut" } }
                : { x: 0 }
          }
          className="bg-card border border-border rounded-xl p-4 relative overflow-visible"
        >
          {playerNumNode}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold">{character.name}</p>
              <p className="text-xs text-muted-foreground">Lv.{character.level} {charClass.name}</p>
            </div>
          </div>
          <div className="space-y-2">
            <HealthBar current={playerHp} max={character.max_hp} color="bg-red-500" label="HP" />
            <HealthBar current={playerMp} max={character.max_mp} color="bg-blue-500" label="MP" />
            <HealthBar current={character.exp} max={character.exp_to_next} color="bg-primary" label="EXP" />
          </div>
          <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
            <span>+{Math.floor(character.max_hp * HP_REGEN_PER_TURN)} HP/turn</span>
            <span>+{Math.floor(character.max_mp * MP_REGEN_PER_TURN)} MP/turn</span>
          </div>
        </motion.div>

        {/* VS */}
        <div className="hidden md:flex items-center justify-center">
          <div className="font-orbitron text-2xl font-bold text-primary/50">VS</div>
        </div>

        {/* Enemy */}
        <motion.div
          animate={
            enemyShake
              ? { x: [8, -8, 6, -6, 3, -3, 0], rotate: lastIsCrit ? [-3, 3, -2, 2, 0] : 0, transition: { duration: enemyShake && lastIsCrit ? 0.6 : 0.35, ease: "easeOut" } }
              : enemyAttackNudge
                ? { x: [0, -18, 0], transition: { duration: 0.25, ease: "easeOut" } }
                : { x: 0, rotate: 0 }
          }
          className="bg-card border border-border rounded-xl p-4 relative overflow-visible"
        >
          {enemyNumNode}
          <AttackVisual
            characterClass={character?.class}
            isSkill={lastAttackIsSkill}
            skillId={lastSkillId}
            show={showAttackVisual}
            damage={lastDamage}
            isCrit={lastIsCrit}
          />
          {enemy ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-lg bg-destructive/20 border border-destructive/30 flex items-center justify-center">
                  <Skull className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <p className="font-bold">{enemy.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {enemy.isBoss && <Badge variant="destructive" className="mr-1 text-xs">BOSS</Badge>}
                    DMG: {enemy.dmg}
                  </p>
                </div>
              </div>
              <HealthBar current={enemyHp} max={enemy.maxHp} color="bg-destructive" label="HP" />
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Searching for enemy...</div>
          )}
        </motion.div>
      </div>

      {/* Skills Bar — compact grid */}
      <div className="bg-card border border-border rounded-xl p-2">
        <div className="flex flex-wrap gap-1.5">
          {/* Basic attack */}
          <button
            disabled={!isMyTurn || !enemy || enemyHp <= 0}
            onClick={() => doPlayerAttack(null)}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[52px]"
          >
            <Swords className="w-3.5 h-3.5 text-foreground" />
            <span className="text-[10px] font-medium leading-none">Attack</span>
          </button>

          {/* Skills */}
          {charSkills.map((skill) => {
            const onCd = (cooldowns[skill.id] || 0) > 0;
            const noMp = playerMp < skill.mp;
            const disabled = !isMyTurn || onCd || noMp || !enemy || enemyHp <= 0;
            const elem = skill.element ? ELEMENT_CONFIG[skill.element] : null;
            const buffColor = skill.buff === "defense" ? "border-blue-500/50 text-blue-400"
              : skill.buff === "attack" ? "border-orange-500/50 text-orange-400"
              : skill.special === "pickpocket" ? "border-yellow-500/50 text-yellow-400"
              : elem ? `border-current/30 ${elem.color}`
              : "border-secondary/40 text-secondary";
            const elemBonus = elem?.stat ? (character?.[elem.stat] || 0) : 0;
            return (
              <button
                key={skill.id}
                disabled={disabled}
                onClick={() => doPlayerAttack(skill)}
                title={`${skill.description}\n${skill.mp}MP · CD: ${skill.cooldown}T${elemBonus > 0 ? `\n+${elemBonus}% ${elem?.label} bonus` : ""}`}
                className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border bg-muted/20 hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[52px] ${buffColor}`}
              >
                <span className="text-sm leading-none">{elem?.icon || <Zap className="w-3 h-3 inline" />}</span>
                <span className="text-[9px] font-medium leading-none text-center max-w-[60px] truncate">{skill.name}</span>
                <span className="text-[8px] text-muted-foreground">{skill.mp}MP</span>
                {onCd && (
                  <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                    {cooldowns[skill.id]}T
                  </span>
                )}
                {elemBonus > 0 && !onCd && (
                  <span className={`absolute -bottom-1.5 -right-1.5 text-[8px] font-bold ${elem?.color} bg-card border border-current/30 rounded-full px-1 leading-tight`}>
                    +{elemBonus}%
                  </span>
                )}
              </button>
            );
          })}

          {/* Potions */}
          {potionGroups.length > 0 && <div className="w-px bg-border self-stretch mx-0.5" />}
          {potionGroups.map((stack) => (
            <button
              key={stack.name}
              onClick={() => usePotionMutation.mutate(stack)}
              disabled={usePotionMutation.isPending || playerHp >= character.max_hp}
              className="relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border border-green-500/40 bg-green-500/5 hover:bg-green-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[52px] text-green-400"
            >
              <Heart className="w-3 h-3" />
              <span className="text-[9px] font-medium leading-none">Potion</span>
              <span className="absolute -top-1.5 -right-1.5 bg-green-600 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                {stack.count}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5">
          🛡 = Defense buff &nbsp;⚔ = Attack buff &nbsp;· Hover for details &nbsp;· CD in turns (T)
        </p>
      </div>

      {/* Loot Drop */}
      <AnimatePresence>
        {lootDrop && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`bg-card border rounded-xl p-3 flex items-center gap-3 ${RARITY_CONFIG[lootDrop.rarity]?.border}`}
          >
            {(() => { const Icon = LOOT_TYPE_ICONS[lootDrop.type] || Sparkles; return <Icon className={`w-5 h-5 ${RARITY_CONFIG[lootDrop.rarity]?.color}`} />; })()}
            <div>
              <p className={`font-semibold text-sm ${RARITY_CONFIG[lootDrop.rarity]?.color}`}>{lootDrop.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{lootDrop.rarity} · {lootDrop.type}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Battle Log */}
      <div className="bg-card border border-border rounded-xl p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">BATTLE LOG</h3>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {battleLog.map((log, i) => {
            const isShiny = log.includes("[SHINY]");
            const isMythic = log.includes("[MYTHIC]");
            const isLegendary = log.includes("[LEGENDARY]");
            const isLevelUp = log.includes("LEVEL UP");
            const isPartyAction = log.startsWith("🗡️");
            const isPartyLoot = log.includes("found [") || (log.includes("found ") && (log.includes("🏆") || log.includes("💎") || log.includes("🌟")));
            let cls = i === 0 ? "text-foreground" : "text-muted-foreground";
            if (isShiny) cls = "text-cyan-300 font-bold animate-pulse";
            else if (isMythic) cls = "text-purple-400 font-bold";
            else if (isLegendary) cls = "text-yellow-400 font-semibold";
            else if (isLevelUp) cls = "text-green-400 font-semibold";
            else if (isPartyLoot) cls = "text-yellow-300 font-semibold";
            else if (isPartyAction) cls = i === 0 ? "text-blue-300" : "text-blue-400/70";
            return (
              <p key={i} className={`text-xs ${cls}`}>{log}</p>
            );
          })}
          {battleLog.length === 0 && <p className="text-xs text-muted-foreground">Engage an enemy to begin combat.</p>}
        </div>
      </div>

      {/* Party Battle Panel */}
      <PartyBattlePanel party={partyData} selfId={character.id} onPartyAction={addLog} />

      {showWelcomeBack && (
        <WelcomeBackModal rewards={welcomeBackRewards} hoursOffline={welcomeBackHours} onClose={() => setShowWelcomeBack(false)} />
      )}
    </div>
    </>
  );
}