import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabaseSync } from "@/lib/supabaseSync";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trophy, Medal, Swords, Coins, Crown, Lock, Trash2, Edit, Backpack, Check, X
} from "lucide-react";
import { CLASSES } from "@/lib/gameData";
import RoleBadge from "@/components/game/RoleBadge";

export default function Leaderboard() {
  const [selectedChar, setSelectedChar] = useState(null);
  const [editStats, setEditStats] = useState(null);
  const [tempStats, setTempStats] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      if (supabaseSync.isEnabled()) {
        const players = await supabaseSync.fetchAllServerPlayers();
        if (players.length > 0) return players;
      }
      return base44.entities.Character.list("-level", 50);
    },
    refetchInterval: 30000,
  });

  const { data: userRoles = {} } = useQuery({
    queryKey: ["userRolesMap"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getAllUsers", {});
      const users = res.data?.users || [];
      const map = {};
      users.forEach(u => { if (u.email) map[u.email] = u.role; });
      return map;
    },
  });

  useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await base44.functions.invoke("getCurrentUser", {});
      setCurrentUser(response.data);
      return response.data;
    },
  });

  const managePlayerMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke("managePlayer", data),
    onSuccess: (response) => {
      if (response.data?.data) {
        setSelectedChar(prev => prev ? { ...prev, ...response.data.data } : null);
      }
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  const updateStatsMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke("managePlayer", data),
    onSuccess: (response) => {
      if (response.data?.data) {
        setSelectedChar(prev => prev ? { ...prev, ...response.data.data } : null);
      }
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setEditStats(null);
      setTempStats({});
    },
  });

  const byLevel = [...characters].sort((a, b) => (b.level || 1) - (a.level || 1));
  const byKills = [...characters].sort((a, b) => (b.total_kills || 0) - (a.total_kills || 0));
  const byGold = [...characters].sort((a, b) => (b.gold || 0) - (a.gold || 0));

  const renderList = (list, valueKey, valueLabel, icon) => (
    <div className="space-y-2 mt-3">
      {list.slice(0, 20).map((char, idx) => {
        const cls = CLASSES[char.class];
        const charRole = userRoles[char.created_by];
        const medals = [
          <Crown key="g" className="w-5 h-5 text-yellow-400" />,
          <Medal key="s" className="w-5 h-5 text-gray-300" />,
          <Medal key="b" className="w-5 h-5 text-orange-400" />,
        ];
        const isClickable = currentUser?.role === "superadmin";
        return (
          <motion.div
            key={char.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03 }}
            onClick={() => isClickable && setSelectedChar(char)}
            className={`bg-card border rounded-xl p-3 flex items-center gap-3 transition-all ${
              idx < 3 ? "border-primary/30" : "border-border"
            } ${isClickable ? "cursor-pointer hover:bg-muted/50" : ""}`}
          >
            <div className="w-8 text-center">
              {idx < 3 ? medals[idx] : <span className="text-sm text-muted-foreground font-medium">#{idx + 1}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{char.name}</span>
                <RoleBadge role={charRole} />
                <Badge variant="outline" className={`text-xs ${cls?.color || ""}`}>
                  {cls?.name || char.class}
                </Badge>
                {char.is_banned && <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-xs">BANNED</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">Level {char.level}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">{(char[valueKey] || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{valueLabel}</p>
            </div>
          </motion.div>
        );
      })}
      {isLoading && Array(5).fill(0).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-3 animate-pulse h-16" />
      ))}
      {!isLoading && list.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">No players yet.</p>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <h2 className="font-orbitron text-xl font-bold flex items-center gap-2">
        <Trophy className="w-5 h-5 text-accent" /> Leaderboard
      </h2>

      <Tabs defaultValue="level">
        <TabsList>
          <TabsTrigger value="level">Level</TabsTrigger>
          <TabsTrigger value="kills">Kills</TabsTrigger>
          <TabsTrigger value="gold">Gold</TabsTrigger>
        </TabsList>
        <TabsContent value="level">
          {renderList(byLevel, "level", "Level", Trophy)}
        </TabsContent>
        <TabsContent value="kills">
          {renderList(byKills, "total_kills", "Kills", Swords)}
        </TabsContent>
        <TabsContent value="gold">
          {renderList(byGold, "gold", "Gold", Coins)}
        </TabsContent>
      </Tabs>

      {/* Character Detail Modal */}
      <AnimatePresence>
        {selectedChar && currentUser?.role === "superadmin" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setSelectedChar(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card border-2 border-border rounded-xl p-6 w-full max-w-2xl max-h-96 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">{selectedChar.name}</h3>
                <div className="flex gap-1">
                  {selectedChar.is_banned && <Badge className="bg-destructive/20 text-destructive border-destructive/30">BANNED</Badge>}
                  {selectedChar.is_muted && <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">MUTED</Badge>}
                  {selectedChar.deleted_from_leaderboard && <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">NO RANK</Badge>}
                </div>
              </div>

              {/* Character Info */}
              <div className="mb-6 p-3 bg-muted/50 rounded-lg grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Level</p>
                  <p className="font-semibold">{selectedChar.level}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Class</p>
                  <p className="font-semibold capitalize">{selectedChar.class}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gold</p>
                  <p className="font-semibold">{selectedChar.gold?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gems</p>
                  <p className="font-semibold">{selectedChar.gems}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Kills</p>
                  <p className="font-semibold">{selectedChar.total_kills}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">HP</p>
                  <p className="font-semibold">{selectedChar.hp}/{selectedChar.max_hp}</p>
                </div>
              </div>

              {/* Edit Stats */}
              {editStats ? (
                <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-lg space-y-3">
                  <p className="text-sm font-semibold">Edit Stats</p>
                  <div className="grid grid-cols-2 gap-2">
                    {["level", "gold", "gems", "hp", "max_hp"].map(stat => (
                      <div key={stat}>
                        <label className="text-xs text-muted-foreground capitalize">{stat}</label>
                        <Input
                          type="number"
                          value={tempStats[stat] ?? selectedChar[stat]}
                          onChange={(e) => setTempStats({ ...tempStats, [stat]: parseInt(e.target.value) })}
                          className="text-xs bg-muted/50 h-7"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => {
                        updateStatsMutation.mutate({
                          action: "update_stats",
                          target_character_id: selectedChar.id,
                          data: tempStats,
                        });
                      }}
                      disabled={updateStatsMutation.isPending}
                    >
                      <Check className="w-3 h-3" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1"
                      onClick={() => { setEditStats(null); setTempStats({}); }}
                    >
                      <X className="w-3 h-3" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="space-y-2 mb-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setEditStats(!editStats)}
                >
                  <Edit className="w-3.5 h-3.5" /> Edit Stats
                </Button>

                <details className="group">
                  <summary className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-muted cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Backpack className="w-3.5 h-3.5" /> Inventory
                    </span>
                    <span className="group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs text-muted-foreground">
                    {selectedChar.equipment ? (
                      <div className="p-2 bg-muted/50 rounded">
                        <p className="font-semibold mb-1">Equipment:</p>
                        <p>{JSON.stringify(selectedChar.equipment)}</p>
                      </div>
                    ) : (
                      <p className="p-2 text-center">No inventory data</p>
                    )}
                  </div>
                </details>

                <Button
                  variant={selectedChar.is_banned ? "outline" : "destructive"}
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => managePlayerMutation.mutate({
                    action: selectedChar.is_banned ? "unban" : "ban",
                    target_character_id: selectedChar.id,
                  })}
                  disabled={managePlayerMutation.isPending}
                >
                  <Lock className="w-3.5 h-3.5" /> {selectedChar.is_banned ? "Unban" : "Ban Player"}
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => managePlayerMutation.mutate({
                    action: "delete",
                    target_character_id: selectedChar.id,
                  })}
                  disabled={managePlayerMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Character
                </Button>
              </div>

              <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedChar(null)}>
                Close
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}