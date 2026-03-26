import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import React, { useState, useEffect } from "react";

import GameLayout from "./components/layout/GameLayout";
import CharacterCreation from "./pages/CharacterCreation";
import CharacterSelection from "./pages/CharacterSelection";
import Battle from "./pages/Battle";
import Inventory from "./pages/Inventory";
import WorldMap from "./pages/WorldMap";
import GuildPage from "./pages/GuildPage.jsx";
import Shop from "./pages/Shop";
import Quests from "./pages/Quests";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import Social from "./pages/Social";
import AdminPanel from "./pages/AdminPanel";
import GameConfig from "./pages/GameConfig";
import LifeSkills from "./pages/LifeSkills";
import GearUpgrading from "./pages/GearUpgrading";
import Dungeons from "./pages/Dungeons";
import SkillTree from "./pages/SkillTree";
import ChatWindow from "./components/game/ChatWindow";
import DailyLoginModal from "./components/game/DailyLoginModal";
import PartyPanel from "./components/game/PartyPanel";
import { useCharacterAutoSave } from "./hooks/useCharacterAutoSave";
import { supabaseSync } from "@/lib/supabaseSync";

const GameApp = () => {
  const { isAuthenticated } = useAuth();

  const [character, setCharacterState] = useState(() => {
    try {
      const saved = sessionStorage.getItem('activeCharacter');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [showCharacterSelection, setShowCharacterSelection] = useState(() => {
    try {
      const saved = sessionStorage.getItem('activeCharacter');
      return !saved;
    } catch { return true; }
  });

  useEffect(() => {
    if (!character?.id) return;
    const storeKey = 'eb_Character';
    try {
      const raw = localStorage.getItem(storeKey);
      let chars = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(chars)) chars = [];
      const exists = chars.some(c => c.id === character.id);
      if (!exists) {
        chars.push(character);
        localStorage.setItem(storeKey, JSON.stringify(chars));
      }
    } catch {}
    if (supabaseSync.isEnabled()) {
      supabaseSync.fullSync(character.id).catch(() => {});
    }
  }, [character?.id]);

  const setCharacter = (charOrUpdater) => {
    setCharacterState(prev => {
      const next = typeof charOrUpdater === 'function' ? charOrUpdater(prev) : charOrUpdater;
      if (next) {
        try { sessionStorage.setItem('activeCharacter', JSON.stringify(next)); } catch {}
      } else {
        try { sessionStorage.removeItem('activeCharacter'); } catch {}
      }
      return next;
    });
  };

  useCharacterAutoSave(character, !!character);

  const handleCharacterSelected = (selectedCharacter) => {
    if (selectedCharacter === null) {
      setShowCharacterSelection(false);
      setCharacter(null);
    } else {
      setCharacter(selectedCharacter);
      setShowCharacterSelection(false);
    }
  };

  const handleCharacterUpdate = (updated) => {
    setCharacter(prev => ({ ...prev, ...updated }));
  };

  const handleBackToSelection = () => {
    setShowCharacterSelection(true);
    setCharacter(null);
    try { sessionStorage.removeItem('activeCharacter'); } catch {}
  };

  if (!isAuthenticated) {
    return null;
  }

  if (showCharacterSelection) {
    return <CharacterSelection onCharacterSelected={handleCharacterSelected} />;
  }

  if (character === null) {
    return <CharacterCreation onCreated={(c) => {
      setCharacter(c);
      setShowCharacterSelection(false);
    }} />;
  }

  if (character) {
    return (
      <>
        <Routes>
          <Route element={<GameLayout character={character} onCharacterUpdate={handleCharacterUpdate} onBackToSelection={handleBackToSelection} />}>
            <Route path="/" element={<Battle character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/inventory" element={<Inventory character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/world" element={<WorldMap character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/guild" element={<GuildPage character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/shop" element={<Shop character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/quests" element={<Quests character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/dashboard" element={<Dashboard character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/profile" element={<Profile character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/social" element={<Social character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/lifeskills" element={<LifeSkills character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/gearupgrading" element={<GearUpgrading character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/dungeons" element={<Dungeons character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/skilltree" element={<SkillTree character={character} onCharacterUpdate={handleCharacterUpdate} />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/gameconfig" element={<GameConfig />} />
            <Route path="*" element={<PageNotFound />} />
          </Route>
        </Routes>
        <ChatWindow character={character} channel="global" />
        <DailyLoginModal character={character} onCharacterUpdate={handleCharacterUpdate} />
        <PartyPanel character={character} />
      </>
    );
  }
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, navigateToLogin } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="font-orbitron text-3xl font-bold text-primary tracking-wider">IDLE REALM</h1>
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigateToLogin();
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="font-orbitron text-3xl font-bold text-primary tracking-wider">IDLE REALM</h1>
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Redirecting to login...</p>
      </div>
    );
  }

  return <GameApp />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <AuthenticatedApp />
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
