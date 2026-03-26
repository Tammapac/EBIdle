import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabaseSync } from "@/lib/supabaseSync";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Crown, LogOut, X, ChevronDown, ChevronRight, ChevronLeft, Check, User, MapPin, Swords, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import PlayerProfileModal from "@/components/game/PlayerProfileModal";
import { REGIONS } from "@/lib/gameData";

const CLASS_COLORS = {
  warrior: "text-red-400", mage: "text-blue-400",
  ranger: "text-green-400", rogue: "text-purple-400"
};

const CLASS_ICONS = {
  warrior: "⚔️", mage: "🔮", ranger: "🏹", rogue: "🗡️"
};

const useSupabase = supabaseSync.isEnabled();

export default function PartyPanel({ character }) {
  const [minimized, setMinimized] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [inviteTarget, setInviteTarget] = useState("");
  const [profileTarget, setProfileTarget] = useState(null);
  const [liveLevels, setLiveLevels] = useState({});
  const [memberDetails, setMemberDetails] = useState({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partyData } = useQuery({
    queryKey: ["party", character?.id],
    queryFn: async () => {
      if (useSupabase) {
        return await supabaseSync.getPartyForCharacter(character.id);
      }
      const led = await base44.entities.Party.filter({ leader_id: character.id });
      const active = led.find(p => p.status !== 'disbanded');
      if (active) return active;
      const all = await base44.entities.Party.list('-updated_date', 50);
      return all.find(p => p.status !== 'disbanded' && p.members?.some(m => m.character_id === character.id)) || null;
    },
    enabled: !!character?.id,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!partyData?.members?.length) return;
    const fetchDetails = async () => {
      const updates = {};
      const levels = {};
      await Promise.all(partyData.members.map(async (m) => {
        if (m.character_id === character.id) return;
        try {
          if (useSupabase) {
            const charData = await supabaseSync.getCharacterById(m.character_id);
            if (charData) {
              levels[m.character_id] = charData.level;
              updates[m.character_id] = { level: charData.level, current_region: charData.current_region, class: charData.class };
            }
          } else {
            const chars = await base44.entities.Character.filter({ id: m.character_id });
            if (chars[0]) {
              levels[m.character_id] = chars[0].level;
              updates[m.character_id] = { level: chars[0].level, current_region: chars[0].current_region, class: chars[0].class };
            }
          }
        } catch {}
      }));
      setLiveLevels(levels);
      setMemberDetails(updates);
    };
    fetchDetails();
    const interval = setInterval(fetchDetails, 15000);
    return () => clearInterval(interval);
  }, [partyData?.id, partyData?.members?.map(m => m.character_id).sort().join(',')]);

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["partyInvites", character?.id],
    queryFn: async () => {
      if (useSupabase) {
        return await supabaseSync.getPendingInvites(character.id);
      }
      return base44.entities.PartyInvite.filter({ to_character_id: character.id, status: 'pending' });
    },
    enabled: !!character?.id,
    refetchInterval: 5000,
  });

  const invalidateParty = () => {
    queryClient.invalidateQueries({ queryKey: ["party"] });
    queryClient.invalidateQueries({ queryKey: ["partyInvites"] });
  };

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (useSupabase) {
        return await handleSupabasePartyAction(payload);
      }
      return base44.functions.invoke("manageParty", { characterId: character.id, ...payload });
    },
    onSuccess: invalidateParty,
    onError: (e) => {
      const msg = e?.message || "Action failed";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const handleSupabasePartyAction = async (payload) => {
    const { action, partyId, targetCharacterId, targetName, inviteId } = payload;

    if (action === 'create') {
      const party = await supabaseSync.createParty(character.id, character.name, character.class, character.level);
      if (!party) throw new Error("Failed to create party");
      return { data: { success: true, party } };
    }

    if (action === 'invite') {
      let resolvedTargetId = targetCharacterId;
      if (targetName) {
        const found = await supabaseSync.fetchPlayerByName(targetName);
        if (!found) throw new Error(`Player "${targetName}" not found`);
        resolvedTargetId = found.id;
      }
      if (!resolvedTargetId) throw new Error("No target specified");
      if (resolvedTargetId === character.id) throw new Error("Cannot invite yourself");
      const invite = await supabaseSync.createPartyInvite(partyId, character.id, character.name, resolvedTargetId);
      if (!invite) throw new Error("Failed to send invite");
      return { data: { success: true, invite } };
    }

    if (action === 'accept') {
      const inv = await supabaseSync.getInviteById(inviteId);
      if (!inv || inv.status !== 'pending') throw new Error("Invite not found or expired");
      if (inv.to_character_id !== character.id) throw new Error("This invite is not for you");
      const party = await supabaseSync.getPartyById(inv.party_id);
      if (!party || party.status === 'disbanded') throw new Error("Party no longer exists");
      const members = party.members || [];
      if (members.length >= (party.max_members || 6)) {
        await supabaseSync.updateInviteStatus(inviteId, 'declined');
        throw new Error("Party is full");
      }
      if (members.some(m => m.character_id === character.id)) {
        await supabaseSync.updateInviteStatus(inviteId, 'accepted');
        return { data: { success: true } };
      }
      members.push({ character_id: character.id, name: character.name, class: character.class, level: character.level });
      await supabaseSync.updateParty(inv.party_id, { members });
      await supabaseSync.updateInviteStatus(inviteId, 'accepted');
      return { data: { success: true } };
    }

    if (action === 'decline') {
      const inv = await supabaseSync.getInviteById(inviteId);
      if (inv && inv.to_character_id !== character.id) throw new Error("This invite is not for you");
      await supabaseSync.updateInviteStatus(inviteId, 'declined');
      return { data: { success: true } };
    }

    if (action === 'leave') {
      const party = await supabaseSync.getPartyById(partyId);
      if (!party) return { data: { success: true } };
      const members = (party.members || []).filter(m => m.character_id !== character.id);
      if (members.length === 0) {
        await supabaseSync.updateParty(partyId, { status: 'disbanded', members: [] });
      } else {
        const updates = { members };
        if (party.leader_id === character.id && members.length > 0) {
          updates.leader_id = members[0].character_id;
          updates.leader_name = members[0].name;
        }
        await supabaseSync.updateParty(partyId, updates);
      }
      return { data: { success: true } };
    }

    return { data: { success: true } };
  };

  const isPlayerInParty = partyData && partyData.status !== 'disbanded' && partyData.members?.some(m => m.character_id === character.id);
  const isLeader = partyData?.leader_id === character.id;
  const memberCount = isPlayerInParty ? (partyData?.members?.length || 0) : 0;
  const expBonus = memberCount > 1 ? (memberCount - 1) * 5 : 0;
  const goldBonus = memberCount > 1 ? (memberCount - 1) * 10 : 0;

  const handleCreate = () => mutation.mutate({ action: 'create' }, {
    onSuccess: () => {
      setMinimized(false);
      setExpanded(true);
      toast({ title: "Party created! Invite players by name.", duration: 3000 });
    },
  });
  const handleLeave = () => mutation.mutate({ action: 'leave', partyId: partyData.id });
  const handleAccept = (invite) => mutation.mutate({ action: 'accept', inviteId: invite.id });
  const handleDecline = (invite) => mutation.mutate({ action: 'decline', inviteId: invite.id });

  const handleInvite = () => {
    if (!inviteTarget.trim()) return;
    const payload = { action: 'invite', partyId: partyData.id };
    if (inviteTarget.includes('-')) {
      payload.targetCharacterId = inviteTarget;
    } else {
      payload.targetName = inviteTarget;
    }
    mutation.mutate(payload, {
      onSuccess: () => {
        toast({ title: `Invite sent to "${inviteTarget}"!`, duration: 2000 });
        setInviteTarget("");
      },
    });
  };

  const getZoneName = (regionKey) => {
    if (!regionKey) return "Unknown";
    const r = REGIONS[regionKey];
    return r ? r.name : regionKey;
  };

  const hasInvites = pendingInvites.length > 0;

  return (
    <>
      {profileTarget && profileTarget.character_id !== character.id && (
        <PlayerProfileModal
          characterId={profileTarget.character_id}
          characterName={profileTarget.name}
          onClose={() => setProfileTarget(null)}
          onInviteToParty={isPlayerInParty && isLeader ? () => {
            mutation.mutate({ action: 'invite', partyId: partyData.id, targetCharacterId: profileTarget.character_id });
            setProfileTarget(null);
          } : undefined}
        />
      )}

      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center">
        <AnimatePresence mode="wait">
          {minimized ? (
            <motion.button
              key="tab"
              initial={{ x: 40 }}
              animate={{ x: 0 }}
              exit={{ x: 40 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={() => setMinimized(false)}
              className="flex flex-col items-center gap-1 bg-card/95 backdrop-blur-sm border border-border border-r-0 rounded-l-xl px-1.5 py-3 shadow-lg hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-primary" />
              <Users className="w-4 h-4 text-primary" />
              {isPlayerInParty && memberCount > 0 && (
                <span className="text-[10px] font-bold text-primary">{memberCount}</span>
              )}
              {hasInvites && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </motion.button>
          ) : (
            <motion.div
              key="panel"
              initial={{ x: 280 }}
              animate={{ x: 0 }}
              exit={{ x: 280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-60 mr-3"
            >
              <AnimatePresence>
                {pendingInvites.map(inv => (
                  <motion.div
                    key={inv.id}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    className="mb-2 bg-card border border-primary/50 rounded-xl p-3 shadow-lg shadow-primary/10"
                  >
                    <p className="text-xs font-semibold text-primary mb-1">Party Invite!</p>
                    <p className="text-xs text-muted-foreground mb-2">{inv.from_name} invites you</p>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleAccept(inv)}>
                        <Check className="w-3 h-3 mr-1" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => handleDecline(inv)}>
                        <X className="w-3 h-3 mr-1" /> Decline
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg overflow-hidden">
                <div className="flex items-center">
                  <button
                    onClick={() => setExpanded(e => !e)}
                    className="flex-1 flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">Party</span>
                      {isPlayerInParty && memberCount > 0 && (
                        <Badge className="bg-primary/20 text-primary text-xs h-5">{memberCount}/6</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {expBonus > 0 && <span className="text-[10px] text-accent">+{expBonus}%XP +{goldBonus}%G</span>}
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                  <button
                    onClick={() => setMinimized(true)}
                    className="px-2 py-2.5 hover:bg-muted/30 transition-colors border-l border-border"
                    title="Minimize"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                        {!isPlayerInParty ? (
                          <>
                            <p className="text-xs text-muted-foreground text-center py-1">No party yet</p>
                            <Button
                              size="sm"
                              className="w-full h-8 text-xs gap-1.5 bg-primary hover:bg-primary/80"
                              onClick={handleCreate}
                              disabled={mutation.isPending}
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Create Party
                            </Button>
                            <p className="text-[10px] text-muted-foreground text-center">
                              Earn +5% XP & +10% Gold per member
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="space-y-1.5">
                              {partyData.members?.map(m => {
                                const isCurrentPlayer = m.character_id === character.id;
                                const details = memberDetails[m.character_id] || {};
                                const displayLevel = isCurrentPlayer ? character.level : (liveLevels[m.character_id] ?? m.level);
                                const memberClass = isCurrentPlayer ? character.class : (details.class || m.class);
                                const memberZone = isCurrentPlayer ? character.current_region : details.current_region;
                                const isSameZone = memberZone === character.current_region;

                                return (
                                  <div
                                    key={m.character_id}
                                    className={`flex flex-col gap-0.5 text-xs cursor-pointer hover:bg-muted/40 rounded-lg p-1.5 -mx-1 transition-colors ${isCurrentPlayer ? 'bg-primary/5 border border-primary/20' : ''}`}
                                    onClick={() => !isCurrentPlayer && setProfileTarget(m)}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {m.character_id === partyData.leader_id && <Crown className="w-3 h-3 text-accent flex-shrink-0" />}
                                      <span className="text-sm">{CLASS_ICONS[memberClass] || "⚔️"}</span>
                                      <span className={`font-medium truncate ${CLASS_COLORS[memberClass] || "text-foreground"}`}>
                                        {m.name}
                                      </span>
                                      <span className="text-muted-foreground ml-auto text-[11px]">Lv.{displayLevel}</span>
                                    </div>
                                    {memberZone && (
                                      <div className="flex items-center gap-1 pl-5">
                                        <MapPin className={`w-2.5 h-2.5 ${isSameZone ? 'text-green-400' : 'text-muted-foreground/50'}`} />
                                        <span className={`text-[10px] truncate ${isSameZone ? 'text-green-400' : 'text-muted-foreground/60'}`}>
                                          {getZoneName(memberZone)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {expBonus > 0 && (
                              <div className="bg-primary/10 rounded-lg p-2 text-xs text-primary flex items-center gap-1.5">
                                <Swords className="w-3 h-3 flex-shrink-0" />
                                +{expBonus}% EXP · +{goldBonus}% Gold
                              </div>
                            )}

                            {isLeader && memberCount < 6 && (
                              <div className="flex gap-1">
                                <input
                                  value={inviteTarget}
                                  onChange={e => setInviteTarget(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                                  placeholder="Invite by name..."
                                  className="flex-1 text-xs bg-muted border border-border rounded px-2 py-1.5 outline-none focus:border-primary transition-colors"
                                />
                                <Button size="sm" className="h-7 text-xs px-2" onClick={handleInvite} disabled={mutation.isPending}>
                                  <UserPlus className="w-3 h-3" />
                                </Button>
                              </div>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={handleLeave}
                            >
                              <LogOut className="w-3 h-3" /> Leave Party
                            </Button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
