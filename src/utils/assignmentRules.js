export function sortByDateAsc(rows) {
  return [...rows].sort((a, b) => new Date(a.action_date || 0) - new Date(b.action_date || 0));
}

export function buildAssignmentLedger(rows) {
  const territoryMap = new Map();
  const userMap = new Map();
  const ordered = sortByDateAsc(rows);

  ordered.forEach((row) => {
    const territoryId = row.territory_id;
    if (!territoryMap.has(territoryId)) {
      territoryMap.set(territoryId, {
        territoryId,
        selectedBy: null,
        selectedAt: null,
        completedBy: null,
        completedAt: null,
        latestAction: null,
        lastCompletedBy: null,
        isSelected: false,
        isCompleted: false
      });
    }

    const entry = territoryMap.get(territoryId);
    entry.latestAction = row.action;

    if (row.action === 'Selected') {
      entry.selectedBy = row.publisher_id;
      entry.selectedAt = row.action_date;
      entry.isSelected = true;
      entry.isCompleted = false;
      entry.completedBy = null;
      entry.completedAt = null;

      if (row.publisher_id) {
        if (!userMap.has(row.publisher_id)) userMap.set(row.publisher_id, { active: [], completed: [] });
        const userEntry = userMap.get(row.publisher_id);
        if (!userEntry.active.includes(territoryId)) userEntry.active.push(territoryId);
        userEntry.completed = userEntry.completed.filter((id) => id !== territoryId);
      }
    }

    if (row.action === 'Completed') {
      entry.completedBy = row.publisher_id;
      entry.lastCompletedBy = row.publisher_id;
      entry.completedAt = row.action_date;
      entry.isCompleted = true;
      entry.isSelected = false;
      entry.selectedBy = null;
      entry.selectedAt = null;

      if (row.publisher_id) {
        if (!userMap.has(row.publisher_id)) userMap.set(row.publisher_id, { active: [], completed: [] });
        const userEntry = userMap.get(row.publisher_id);
        userEntry.active = userEntry.active.filter((id) => id !== territoryId);
        if (!userEntry.completed.includes(territoryId)) userEntry.completed.push(territoryId);
      }
    }

    if (row.action === 'Returned') {
      entry.isSelected = false;
      entry.isCompleted = false;
      entry.selectedBy = null;
      entry.selectedAt = null;
      entry.completedBy = null;
      entry.completedAt = null;

      if (row.publisher_id) {
        if (!userMap.has(row.publisher_id)) userMap.set(row.publisher_id, { active: [], completed: [] });
        const userEntry = userMap.get(row.publisher_id);
        userEntry.active = userEntry.active.filter((id) => id !== territoryId);
        userEntry.completed = userEntry.completed.filter((id) => id !== territoryId);
      }
    }
  });

  return { territoryMap, userMap };
}

export function canClaimTerritory(state, userId) {
  if (!userId) return false;
  if (state?.isCompleted) return false;
  if (!state?.isSelected) return true;
  return state.selectedBy === userId;
}

export function canReturnTerritory(state, userId, role) {
  if (!userId || !state?.isSelected) return false;
  if (role === 'Admin') return true;
  return state.selectedBy === userId;
}

export function canCompleteTerritory(state, userId, role) {
  if (!userId || state?.isCompleted) return false;
  if (role === 'Admin' || role === 'Conductor') return true;
  return state?.selectedBy === userId;
}

export function canUnmarkCompletion(state, userId, role) {
  if (!userId || !state?.isCompleted) return false;
  if (role === 'Admin') return true;
  return state?.lastCompletedBy === userId;
}

export function validateAssignmentAction({ state, action, userId, role }) {
  if (action === 'Selected') {
    if (canClaimTerritory(state, userId)) return { ok: true };
    if (state?.isCompleted) return { ok: false, message: 'This territory is already completed and cannot be claimed.' };
    if (state?.isSelected && state?.selectedBy && state.selectedBy !== userId) return { ok: false, message: 'This territory is already selected by another publisher.' };
    return { ok: false, message: 'This territory cannot be claimed right now.' };
  }

  if (action === 'Returned') {
    if (state?.isCompleted) {
      return canUnmarkCompletion(state, userId, role)
        ? { ok: true }
        : { ok: false, message: 'Only the same completing conductor or an Admin can unmark a completed territory.' };
    }
    return canReturnTerritory(state, userId, role)
      ? { ok: true }
      : { ok: false, message: 'Only the selecting publisher or an Admin can return this territory.' };
  }

  if (action === 'Completed') {
    return canCompleteTerritory(state, userId, role)
      ? { ok: true }
      : { ok: false, message: 'Only the selecting publisher, a Conductor, or an Admin can complete this territory.' };
  }

  return { ok: false, message: 'Unknown assignment action.' };
}
