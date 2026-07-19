// Minimal ICS (iCalendar) parser: extracts VEVENT start/end times.
// Handles the common DTSTART/DTEND formats (UTC "Z" and floating local
// time). Recurring events (RRULE) are intentionally not expanded — good
// enough for "block out my one-off busy times," not a full calendar engine.

function parseIcsDate(value) {
  // Formats seen in the wild: "20260804T150000Z" or "20260804T150000" or "20260804"
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

/** Unfold ICS lines: continuation lines start with a space or tab. */
function unfold(icsText) {
  return icsText.replace(/\r\n[ \t]/g, "").split(/\r\n|\n/);
}

/**
 * @param {string} icsText raw .ics file contents
 * @returns {Array<{start: Date, end: Date}>}
 */
export function parseIcsEvents(icsText) {
  const lines = unfold(icsText);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
    } else if (line.startsWith("END:VEVENT")) {
      if (current?.start && current?.end) events.push(current);
      current = null;
    } else if (current) {
      const [rawKey, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      const key = rawKey.split(";")[0]; // strip params like ";TZID=..."
      if (key === "DTSTART") current.start = parseIcsDate(value);
      if (key === "DTEND") current.end = parseIcsDate(value);
    }
  }
  return events.filter((e) => e.start && e.end);
}

/**
 * Given parsed events and a session's chronological slot ids (format
 * "YYYY-MM-DDTHH:MM"), return the slot ids that fall inside any event —
 * i.e. the user's existing busy times.
 */
export function slotsCoveredByEvents(slotIds, events, blockMinutes) {
  const covered = new Set();
  for (const slotId of slotIds) {
    const slotStart = new Date(slotId);
    const slotEnd = new Date(slotStart.getTime() + blockMinutes * 60000);
    for (const event of events) {
      if (slotStart < event.end && slotEnd > event.start) {
        covered.add(slotId);
        break;
      }
    }
  }
  return covered;
}
