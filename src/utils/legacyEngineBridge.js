export const ENGINE_MODE_KEY = 'territory-assistant:engine-launch-mode';
export const ENGINE_CAMPAIGN_KEY = 'territory-assistant:engine-campaign-name';
export const ENGINE_SELECTED_KEY = 'territory-assistant:selected-territory';
export const ACTIVE_CAMPAIGN_KEY = 'territory-assistant:active-campaign';
export const ENGINE_TRANSITION_KEY = 'territory-assistant:engine-transition';
export const ENGINE_HISTORY_KEY = 'territory-assistant:engine-history';

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function readEngineSelectedTerritory() {
  return safeJsonParse(window.localStorage.getItem(ENGINE_SELECTED_KEY), null);
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function readLegacyEngineHistory() {
  return safeJsonParse(window.localStorage.getItem(ENGINE_HISTORY_KEY), []);
}

export function appendLegacyEngineHistory(entry = {}) {
  const existing = readLegacyEngineHistory();
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...entry
    },
    ...existing
  ].slice(0, 24);

  window.localStorage.setItem(ENGINE_HISTORY_KEY, safeJsonStringify(next));
  window.dispatchEvent(new CustomEvent('territory-assistant:engine-history-changed', { detail: next[0] }));
  return next;
}

export function readActiveCampaign() {
  return safeJsonParse(window.localStorage.getItem(ACTIVE_CAMPAIGN_KEY), null);
}

export function readLegacyEngineContext() {
  const selected = readEngineSelectedTerritory();
  const activeCampaign = readActiveCampaign();
  const launchMode = window.localStorage.getItem(ENGINE_MODE_KEY) || (activeCampaign ? 'campaign' : 'all');
  const campaignName = window.localStorage.getItem(ENGINE_CAMPAIGN_KEY) || activeCampaign?.name || '';
  const transition = safeJsonParse(window.localStorage.getItem(ENGINE_TRANSITION_KEY), null);

  return {
    selected,
    launchMode,
    campaignName,
    activeCampaign,
    transition,
    campaignActive: Boolean(activeCampaign?.id || campaignName)
  };
}

export function writeLegacyEngineContext({ selected = null, launchMode = 'all', campaignName = '', transition = null } = {}) {
  if (selected) {
    window.localStorage.setItem(ENGINE_SELECTED_KEY, JSON.stringify(selected));
  }
  if (launchMode) {
    window.localStorage.setItem(ENGINE_MODE_KEY, launchMode);
  }
  window.localStorage.setItem(ENGINE_CAMPAIGN_KEY, campaignName || '');
  if (transition) {
    window.localStorage.setItem(ENGINE_TRANSITION_KEY, JSON.stringify({
      ...transition,
      syncedAt: new Date().toISOString()
    }));
  }
  appendLegacyEngineHistory({
    kind: 'context-write',
    territoryId: selected?.id ?? null,
    territoryNo: selected?.territoryNo ?? null,
    launchMode,
    campaignName: campaignName || '',
    source: transition?.source || 'shell',
    role: transition?.role || null
  });
  window.dispatchEvent(new CustomEvent('territory-assistant:selected-territory-changed', { detail: selected?.id ?? null }));
}
