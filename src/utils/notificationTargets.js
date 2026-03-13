const NOTIFICATION_TARGETS_KEY = 'territory-assistant-notification-targets';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

const defaultTargets = [
  {
    id: 'default-email-admin',
    label: 'Admin Email Queue',
    channel: 'email',
    destination: '',
    role_scope: 'Admin',
    active: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'default-sms-conductor',
    label: 'Conductor Email-to-Text Queue',
    channel: 'email_to_sms',
    destination: '',
    role_scope: 'Conductor',
    active: false,
    created_at: new Date().toISOString()
  }
];

export function getNotificationTargets() {
  const targets = readJson(NOTIFICATION_TARGETS_KEY, null);
  if (Array.isArray(targets) && targets.length) return targets;
  return defaultTargets;
}

export function saveNotificationTargets(targets) {
  const next = (targets || []).map((item) => ({
    ...item,
    updated_at: new Date().toISOString()
  }));
  writeJson(NOTIFICATION_TARGETS_KEY, next);
  return next;
}

export function upsertNotificationTarget(target) {
  const current = getNotificationTargets();
  const existing = current.find((item) => item.id === target.id);
  const next = existing
    ? current.map((item) => (item.id === target.id ? { ...item, ...target, updated_at: new Date().toISOString() } : item))
    : [{
        id: target.id || `target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        active: true,
        role_scope: 'Conductor',
        ...target,
        updated_at: new Date().toISOString()
      }, ...current];
  writeJson(NOTIFICATION_TARGETS_KEY, next);
  return next;
}

export function removeNotificationTarget(id) {
  const next = getNotificationTargets().filter((item) => item.id !== id);
  writeJson(NOTIFICATION_TARGETS_KEY, next);
  return next;
}
