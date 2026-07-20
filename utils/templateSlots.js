/**
 * @param {string[]} slotIds session slot ids, format "YYYY-MM-DDTHH:MM"
 * @param {Array<{dayOfWeek:number, startTime:string, endTime:string}>} blocks
 * @returns {Set<string>} slot ids that fall inside any recurring block
 */
export function slotsCoveredByTemplate(slotIds, blocks) {
  const covered = new Set();
  for (const slotId of slotIds) {
    const [datePart, timePart] = slotId.split("T");
    const dayOfWeek = new Date(`${datePart}T00:00:00`).getDay();
    for (const block of blocks) {
      if (block.dayOfWeek !== dayOfWeek) continue;
      if (timePart >= block.startTime && timePart < block.endTime) {
        covered.add(slotId);
        break;
      }
    }
  }
  return covered;
}
