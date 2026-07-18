// Builds the list of time blocks for a session, e.g. every 30 minutes
// between startHour and endHour, for every day in the date range.
// Each slot id looks like "2026-08-03T16:00" so it sorts chronologically
// as a plain string.

export function generateSlots({ startDate, endDate, startHour, endHour, blockMinutes }) {
  const slots = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const dateStr = day.toISOString().slice(0, 10);
    let minutesIntoDay = startHour * 60;
    const endMinutes = endHour * 60;
    while (minutesIntoDay < endMinutes) {
      const hh = String(Math.floor(minutesIntoDay / 60)).padStart(2, "0");
      const mm = String(minutesIntoDay % 60).padStart(2, "0");
      slots.push(`${dateStr}T${hh}:${mm}`);
      minutesIntoDay += blockMinutes;
    }
  }
  return slots;
}
