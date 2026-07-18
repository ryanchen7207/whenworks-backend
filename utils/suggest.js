// Scores each time block across all participants and ranks the best times.
// Weights: preferred > okay > avoid > unmarked (unavailable, scores 0 and
// doesn't count toward "available" headcount at all).
const WEIGHTS = { preferred: 3, okay: 2, avoid: 1 };

/**
 * @param {string[]} slotIds - all block ids in the session, in chronological order
 * @param {Object} participants - { name: { slotId: 'preferred'|'okay'|'avoid' } }
 * @returns {Array<{slotId: string, availableCount: number, weightedScore: number}>}
 *          sorted best-first
 */
export function rankSlots(slotIds, participants) {
  const names = Object.keys(participants);

  const scored = slotIds.map((slotId) => {
    let availableCount = 0;
    let weightedScore = 0;
    for (const name of names) {
      const status = participants[name]?.[slotId];
      if (status && WEIGHTS[status]) {
        availableCount += 1;
        weightedScore += WEIGHTS[status];
      }
    }
    return { slotId, availableCount, weightedScore };
  });

  // Rank by: most people available first, then highest weighted score,
  // then earliest slot (slotIds are chronological, so index order is a tiebreaker).
  return scored
    .map((s, index) => ({ ...s, index }))
    .sort((a, b) => {
      if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
      if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
      return a.index - b.index;
    })
    .map(({ index, ...rest }) => rest);
}

export function totalParticipants(participants) {
  return Object.keys(participants).length;
}
