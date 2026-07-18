import { Router } from "express";
import { nanoid } from "nanoid";
import { readSessions, writeSessions } from "../utils/store.js";
import { generateSlots } from "../utils/slots.js";
import { rankSlots, totalParticipants } from "../utils/suggest.js";

const router = Router();

const VALID_STATUSES = ["preferred", "okay", "avoid"];

// Create a new session
router.post("/", async (req, res) => {
  const { title, startDate, endDate, startHour = 8, endHour = 20, blockMinutes = 30 } = req.body;

  if (!title || !startDate || !endDate) {
    return res.status(400).json({ error: "title, startDate, and endDate are required" });
  }

  const slots = generateSlots({ startDate, endDate, startHour, endHour, blockMinutes });
  if (slots.length === 0) {
    return res.status(400).json({ error: "date/time range produced no time blocks" });
  }

  const id = nanoid(8);
  const sessions = await readSessions();
  sessions[id] = {
    id,
    title,
    startDate,
    endDate,
    startHour,
    endHour,
    blockMinutes,
    slots,
    participants: {}, // { name: { slotId: status } }
    createdAt: new Date().toISOString(),
  };
  await writeSessions(sessions);

  res.status(201).json(sessions[id]);
});

// Get a session (for joining / rendering the grid)
router.get("/:id", async (req, res) => {
  const sessions = await readSessions();
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

  const sessions = await readSessions();
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });

  // Only keep valid slot ids and valid statuses
  const cleaned = {};
  for (const [slotId, status] of Object.entries(availability)) {
    if (session.slots.includes(slotId) && VALID_STATUSES.includes(status)) {
      cleaned[slotId] = status;
    }
  }

  session.participants[name] = cleaned;
  await writeSessions(sessions);

  res.json({ ok: true, participantCount: totalParticipants(session.participants) });
});

// Get ranked results / suggested best times
router.get("/:id/results", async (req, res) => {
  const sessions = await readSessions();
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });

  const ranked = rankSlots(session.slots, session.participants);
  const participantCount = totalParticipants(session.participants);

  res.json({
    title: session.title,
    participantCount,
    participants: Object.keys(session.participants),
    ranked, // sorted best-first: [{slotId, availableCount, weightedScore}, ...]
  });
});

// Stub for .ics calendar import — read-only, no OAuth needed.
// A real implementation would parse VEVENT blocks and mark those slots
// as unavailable ("busy") before the user taps anything manually.
router.post("/:id/import-ics", async (req, res) => {
  const { icsText } = req.body;
  if (!icsText) return res.status(400).json({ error: "icsText is required" });

  // TODO: parse icsText (e.g. with the "ical.js" or "node-ical" package),
  // extract VEVENT start/end times, map them onto this session's slot ids,
  // and pre-mark those as busy for the joining participant.
  res.json({
    ok: true,
    note: "Parsing not yet implemented — see the TODO in import-ics for next steps.",
  });
});

export default router;
