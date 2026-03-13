const STORAGE_KEY = 'territory-assistant-review-resolutions';

function readStorage() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStorage(payload) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getStoredReviewResolutions() {
  return readStorage();
}

export function setStoredReviewResolution(queueKey, itemKey, patch) {
  const current = readStorage();
  if (!current[queueKey]) current[queueKey] = {};
  current[queueKey][itemKey] = { ...(current[queueKey][itemKey] || {}), ...patch, updatedAt: new Date().toISOString() };
  writeStorage(current);
  return current;
}

export function applyReviewResolutions(queues, resolutions) {
  return Object.fromEntries(Object.entries(queues).map(([queueKey, items]) => {
    const queueRes = resolutions[queueKey] || {};
    const nextItems = items.map((item, index) => {
      const key = item.id || item.address || item.issue || `item-${index}`;
      return {
        ...item,
        resolutionKey: key,
        resolution: queueRes[key] || null,
        isResolved: Boolean(queueRes[key]?.resolved)
      };
    });
    return [queueKey, nextItems];
  }));
}
