import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Sparkles, Target, Swords, ChevronRight } from "lucide-react";
import { CLASSES } from "@/lib/gameData";
import { calculateFinalStats, CLASS_BASE_HP, CLASS_BASE_MP, HP_PER_LEVEL, MP_PER_LEVEL, VIT_TO_HP, INT_TO_MP } from "@/lib/statSystem";

const CLASS_ICONS = { warrior: Shield, mage: Sparkles, ranger: Target, rogue: Swords };

export default function CharacterCreation({ onCreated }) {
  const [name, setName] = useState("");
  const [selectedClass, setSelectedClass] = useState(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      try {
        const me = await base44.auth.me();
        if (!me) throw new Error("Not authenticated");

        const cls = CLASSES[selectedClass];
        const baseHp = (CLASS_BASE_HP[selectedClass] || 100) + cls.baseStats.vitality * VIT_TO_HP;
        const baseMp = (CLASS_BASE_MP[selectedClass] || 50) + cls.baseStats.intelligence * INT_TO_MP;
        const char = await base44.entities.Character.create({
          name,
          created_by: me.email,
          class: selectedClass,
          level: 1,
          exp: 0,
          exp_to_next: 100,
          hp: baseHp,
          max_hp: baseHp,
          mp: baseMp,
          max_mp: baseMp,
          ...cls.baseStats,
          stat_points: 0,
          gold: 100,
          gems: 10,
          current_region: "verdant_forest",
          equipment: {},
          skills: [cls.skills[0]],
          skill_points: 0,
          idle_mode: false,
          total_kills: 0,
          total_damage: 0,
          prestige_level: 0,
          achievements: [],
          daily_quests_completed: 0,
          weekly_quests_completed: 0,
          last_idle_claim: new Date().toISOString(),
        });
        return char;
      } catch (err) {
        console.error("Failed to create character:", err);
        throw err;
      }
    },
    onSuccess: (char) => onCreated(char),
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-10">
          <h1 className="font-orbitron text-4xl md:text-5xl font-bold text-primary tracking-wider mb-3">
            IDLE REALM
          </h1>
          <p className="text-muted-foreground text-lg">Create your hero and begin your adventure</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 glow-cyan">
          <div className="mb-6">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Character Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your hero's name..."
              className="text-lg h-12 bg-muted/50"
              maxLength={20}
            />
          </div>

          <div className="mb-8">
            <label className="text-sm font-medium text-muted-foreground mb-3 block">Choose Your Class</label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(CLASSES).map(([key, cls]) => {
                const Icon = CLASS_ICONS[key];
                const active = selectedClass === key;
                return (
                  <motion.button
                    key={key}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedClass(key)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      active
                        ? "border-primary bg-primary/10 glow-cyan"
                        : "border-border bg-muted/30 hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${active ? "bg-primary/20" : "bg-muted"}`}>
                        <Icon className={`w-5 h-5 ${cls.color}`} />
                      </div>
                      <span className={`font-bold ${cls.color}`}>{cls.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{cls.description}</p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {Object.entries(cls.baseStats).map(([stat, val]) => (
                        <span key={stat} className="text-xs bg-muted px-2 py-0.5 rounded">
                          {stat.slice(0, 3).toUpperCase()} {val}
                        </span>
                      ))}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <Button
            size="lg"
            className="w-full h-12 font-orbitron text-base tracking-wider"
            disabled={!name.trim() || !selectedClass || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating..." : "Begin Adventure"}
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}