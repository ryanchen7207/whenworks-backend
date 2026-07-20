import { Router } from "express";
import { nanoid } from "nanoid";
import { readStore, writeStore } from "../utils/store.js";
import { generateSlots } from "../utils/slots.js";
import { rankSlots, totalParticipants } from "../utils/suggest.js";
import { parseIcsEvents, slotsCoveredByEvents } from "../utils/ics.js";
import { slotsCoveredByTemplate } from "../utils/templateSlots.js";
import { getFreshAccessToken } from "../utils/googleAuth.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = Router();
const FILE = "sessions.json";
const USERS_FILE = "users.json";
const TEMPLATES_FILE = "templates.json";
const VALID_STATUSES = ["preferred", "okay", "avoid"];

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
    participants: {},
    confirmedSlot: null, // set once the owner locks in a final time
    createdAt: new Date().toISOString(),
  };
  await writeStore(FILE, sessions);

  res.status(201).json(sessions[id]);
});

router.get("/mine", requireAuth, async (req, res) => {
  const sessions = await readStore(FILE);
  const mine = Object.values(sessions)
    .filter((s) => s.ownerId === req.user.id)
    .map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      participantCount: totalParticipants(s.participants),
      confirmedSlot: s.confirmedSlot,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ sessions: mine });
});

router.get("/:id", async (req, res) => {
  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });
  res.json(session);
});

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
    confirmedSlot: session.confirmedSlot,
  });
});

// Owner locks in the final chosen time. Anyone opening the link afterward
// sees it clearly marked as confirmed instead of still "collecting votes."
router.post("/:id/confirm", requireAuth, async (req, res) => {
  const { slotId } = req.body;
  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });
  if (session.ownerId !== req.user.id) return res.status(403).json({ error: "only the session creator can confirm a time" });
  if (slotId && !session.slots.includes(slotId)) return res.status(400).json({ error: "invalid slot" });

  session.confirmedSlot = slotId || null; // null = un-confirm
  await writeStore(FILE, sessions);
  res.json({ ok: true, confirmedSlot: session.confirmedSlot });
});

// Manual .ics upload — works for anyone, no account needed.
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

// One-click alternative to manual .ics upload — pulls busy times straight
// from the signed-in user's connected Google Calendar.
router.get("/:id/google-busy", requireAuth, async (req, res) => {
  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });

  const users = await readStore(USERS_FILE);
  const user = users[req.user.id];
  if (!user?.googleRefreshToken) {
    return res.status(400).json({ error: "Google Calendar isn't connected for this account yet" });
  }

  try {
    const accessToken = await getFreshAccessToken(user.googleRefreshToken);
    const timeMin = new Date(`${session.startDate}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${session.endDate}T23:59:59Z`).toISOString();

    const resp = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: "primary" }] }),
    });
    if (!resp.ok) throw new Error(`Google Calendar API error: ${resp.status}`);
    const data = await resp.json();
    const busyPeriods = data.calendars?.primary?.busy || [];
    const events = busyPeriods.map((p) => ({ start: new Date(p.start), end: new Date(p.end) }));

    const covered = slotsCoveredByEvents(session.slots, events, session.blockMinutes);
    res.json({ ok: true, busySlotIds: Array.from(covered), eventsFound: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply a signed-in user's saved recurring commitment template to this
// session, marking the matching blocks as busy the same way calendar sync does.
router.get("/:id/template-busy/:templateId", requireAuth, async (req, res) => {
  const sessions = await readStore(FILE);
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: "session not found" });

  const templates = await readStore(TEMPLATES_FILE);
  const template = templates[req.params.templateId];
  if (!template || template.userId !== req.user.id) {
    return res.status(404).json({ error: "template not found" });
  }

  const covered = slotsCoveredByTemplate(session.slots, template.blocks);
  res.json({ ok: true, busySlotIds: Array.from(covered) });
});

export default router;
