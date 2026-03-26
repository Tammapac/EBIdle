import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import entitiesRouter from "./entities";
import functionsRouter from "./functions";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.get("/test", async (req, res) => {
  const { data, error } = await supabase.from("characters").select("*");
  res.json({ data, error });
});

router.get("/supabase-status", async (req, res) => {
  const tableNames = [
    "users", "sessions", "characters", "items", "guilds", "quests",
    "trades", "parties", "party_activities", "party_invites", "presences",
    "player_sessions", "chat_messages", "mail", "resources", "game_config",
    "friend_requests", "friendships", "trade_sessions", "dungeon_sessions",
    "gem_labs", "private_messages", "user_roles",
  ];

  const results: Array<{ table: string; status: string; count?: number; error?: string }> = [];

  for (const name of tableNames) {
    const { count, error } = await supabase.from(name).select("*", { count: "exact", head: true });
    if (error) {
      results.push({ table: name, status: "missing", error: error.message });
    } else {
      results.push({ table: name, status: "ok", count: count ?? 0 });
    }
  }

  res.json({ results });
});

router.use(entitiesRouter);
router.use(functionsRouter);

export default router;
