import { Router } from "express";
import { nanoid } from "nanoid";
import { readStore, writeStore } from "../utils/store.js";
import { generateSlots } from "../utils/slots.js";
import { rankSlots, totalParticipants } from "../utils/suggest.js";
import { parseIcsEvents, slotsCoveredByEvents } from "../utils/ics.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = Router();
const FILE = "sessions.json";
const VALID_STATUSES = ["preferred", "okay", "avoid"];

// Create a new session. Signed-in users get it attached to their account
// (shows up on their dashboard); guests can still create sessions, they
// just won't see them listed anywhere later.
router.post("/", optionalAuth, async (req, res) => {
  const { title, startDate, endDate, startHour = 8, endHour = 20, blockMinutes = 30 } = req.body;

  if (!title || !startDate || !endDate) {
    return res.status(400).json({ error: "title, startDate, and endDate are required" });
  }

  const slots = generateSlots({ startDate, endDate, startHour, endHour, blockMinutes });
  if (slots.length === 0) {
    return res.status(400).json({ error: "date/time range produced no time blocks" });
  }

  const id = nanoid(8);
  const sessions = await readStore(FILE);
  sessions[id] = {
    id,
    title,
    startDate,
    endDate,
    startHour,
    endHour,
    blockMinutes,
    slots,
    ownerId: req.user?.id || null,
    participants: {}, // { name: { slotId: status } }
    createdAt: new Date().toISOString(),
  };
  await writeStore(FILE, sessions);

  res.status(201).json(sessions[id]);
});

// Sessions belonging to the signed-in user (dashboard)
router.get("/mine", requireAuth, async (req, res) => {
  const sessions = await readStore(FILE);
  const mine = Object.values(sessions)
    .filter((s) => s.ownerId === req.user.id)
    .map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      participantCount: totalParticipants(s.participants),
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ sessions: mine });
});

// Get a session (for joining / rendering the grid)
router.get("/:id", async (req, res) => {
  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });
  res.json(session);
});

// Join a session / submit or update your availability
router.post("/:id/join", async (req, res) => {
  const { name, availability } = req.body;
  if (!name || typeof availability !== "object") {
    return res.status(400).json({ error: "name and availability are required" });
  }

  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });

  const cleaned = {};
  for (const [slotId, status] of Object.entries(availability)) {
    if (session.slots.includes(slotId) && VALID_STATUSES.includes(status)) {
      cleaned[slotId] = status;
    }
  }

  session.participants[name] = cleaned;
  await writeStore(FILE, sessions);

  res.json({ ok: true, participantCount: totalParticipants(session.participants) });
});

// Get ranked results / suggested best times
router.get("/:id/results", async (req, res) => {
  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });

  const ranked = rankSlots(session.slots, session.participants);
  const participantCount = totalParticipants(session.participants);

  res.json({
    title: session.title,
    participantCount,
    participants: Object.keys(session.participants),
    ranked,
  });
});

// Parse an uploaded .ics file and return which of this session's slots
// overlap the user's existing calendar events, so the frontend can
// pre-mark those as unavailable before the user taps anything by hand.
router.post("/:id/import-ics", async (req, res) => {
  const { icsText } = req.body;
  if (!icsText) return res.status(400).json({ error: "icsText is required" });

  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });

  const events = parseIcsEvents(icsText);
  const covered = slotsCoveredByEvents(session.slots, events, session.blockMinutes);

  res.json({ ok: true, busySlotIds: Array.from(covered), eventsFound: events.length });
});

export default router;
