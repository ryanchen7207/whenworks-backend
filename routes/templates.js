import { Router } from "express";
import { nanoid } from "nanoid";
import { readStore, writeStore } from "../utils/store.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const FILE = "templates.json";

// A template stores recurring weekly commitments, e.g.
// { dayOfWeek: 1 (Mon), startTime: "08:00", endTime: "15:00", label: "School" }
router.get("/", requireAuth, async (req, res) => {
  const all = await readStore(FILE);
  const mine = Object.values(all).filter((t) => t.userId === req.user.id);
  res.json({ templates: mine });
});

router.post("/", requireAuth, async (req, res) => {
  const { name, blocks } = req.body;
  if (!name?.trim() || !Array.isArray(blocks)) {
    return res.status(400).json({ error: "name and blocks[] are required" });
  }

  const all = await readStore(FILE);
  const id = nanoid(8);
  all[id] = {
    id,
    userId: req.user.id,
    name: name.trim(),
    blocks, // [{ dayOfWeek, startTime, endTime, label }]
    createdAt: new Date().toISOString(),
  };
  await writeStore(FILE, all);
  res.status(201).json(all[id]);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const all = await readStore(FILE);
  const template = all[req.params.id];
  if (!template) return res.status(404).json({ error: "template not found" });
  if (template.userId !== req.user.id) return res.status(403).json({ error: "not your template" });
  delete all[req.params.id];
  await writeStore(FILE, all);
  res.json({ ok: true });
});

export default router;
