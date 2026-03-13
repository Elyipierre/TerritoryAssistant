const NOTIFICATION_PROVIDERS_KEY = 'territory-assistant-notification-providers';

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

const defaultProviders = [
  {
    id: 'provider-resend-email',
    label: 'Resend Email',
    channel: 'email',
    provider_type: 'resend',
    sender_identity: 'alerts@example.com',
    active: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'provider-resend-gateway',
    label: 'Resend Email-to-Text',
    channel: 'email_to_sms',
    provider_type: 'resend',
    sender_identity: 'alerts@example.com',
    active: false,
    created_at: new Date().toISOString()
  }
];

export function getNotificationProviders() {
  const providers = readJson(NOTIFICATION_PROVIDERS_KEY, null);
  if (Array.isArray(providers) && providers.length) return providers;
  return defaultProviders;
}

export function saveNotificationProviders(providers) {
  const next = (providers || []).map((item) => ({
    ...item,
    updated_at: new Date().toISOString()
  }));
  writeJson(NOTIFICATION_PROVIDERS_KEY, next);
  return next;
}

export function upsertNotificationProvider(provider) {
  const current = getNotificationProviders();
  const existing = current.find((item) => item.id === provider.id);
  const next = existing
    ? current.map((item) => (item.id === provider.id ? { ...item, ...provider, updated_at: new Date().toISOString() } : item))
    : [{
        id: provider.id || `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        active: true,
        channel: 'email',
        provider_type: 'resend',
        sender_identity: '',
        ...provider,
        updated_at: new Date().toISOString()
      }, ...current];
  writeJson(NOTIFICATION_PROVIDERS_KEY, next);
  return next;
}

export function removeNotificationProvider(id) {
  const next = getNotificationProviders().filter((item) => item.id !== id);
  writeJson(NOTIFICATION_PROVIDERS_KEY, next);
  return next;
}
