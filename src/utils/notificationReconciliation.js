const NOTIFICATION_EVENTS_KEY = 'territory-assistant-notification-events';

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

export function getNotificationEvents() {
  return readJson(NOTIFICATION_EVENTS_KEY, []);
}

export function saveNotificationEvents(events = []) {
  const current = getNotificationEvents();
  const map = new Map(current.map((item) => [item.id, item]));
  events.forEach((event) => map.set(event.id, { ...event }));
  const next = [...map.values()]
    .sort((a, b) => new Date(b.occurred_at || b.created_at || 0) - new Date(a.occurred_at || a.created_at || 0))
    .slice(0, 500);
  writeJson(NOTIFICATION_EVENTS_KEY, next);
  return next;
}

export function providerEventToPatch(event) {
  const eventType = String(event?.event_type || event?.type || '').toLowerCase();
  const occurredAt = event?.occurred_at || event?.received_at || new Date().toISOString();

  if (['accepted', 'processed', 'queued', 'sent'].includes(eventType)) {
    return {
      status: 'dispatched',
      delivery_state: 'sent',
      delivery_state_at: occurredAt,
      failure_reason: null,
      delivery_detail: 'Provider accepted the notification for delivery.'
    };
  }

  if (['delivered'].includes(eventType)) {
    return {
      status: 'dispatched',
      delivery_state: 'delivered',
      delivery_state_at: occurredAt,
      delivered_at: occurredAt,
      failure_reason: null,
      delivery_detail: 'Provider confirmed delivery.'
    };
  }

  if (['opened', 'open'].includes(eventType)) {
    return {
      status: 'dispatched',
      delivery_state: 'opened',
      delivery_state_at: occurredAt,
      opened_at: occurredAt,
      failure_reason: null,
      delivery_detail: 'Recipient opened the message.'
    };
  }

  if (['clicked', 'click'].includes(eventType)) {
    return {
      status: 'dispatched',
      delivery_state: 'clicked',
      delivery_state_at: occurredAt,
      clicked_at: occurredAt,
      failure_reason: null,
      delivery_detail: 'Recipient clicked a tracked link.'
    };
  }

  if (['bounced', 'bounce', 'complained', 'spam_complaint', 'dropped', 'failed'].includes(eventType)) {
    return {
      status: 'failed',
      delivery_state: 'bounced',
      delivery_state_at: occurredAt,
      bounced_at: occurredAt,
      failure_reason: event?.failure_reason || event?.reason || 'Provider reported a delivery failure.',
      delivery_detail: event?.detail || 'Provider reported a bounce or complaint.'
    };
  }

  return {
    delivery_state: eventType || 'unknown',
    delivery_state_at: occurredAt,
    delivery_detail: normalized?.detail || event?.detail || 'Lifecycle event received from provider.'
  };
}

export function buildSimulatedLifecycleEvents(notification, lifecycleType = 'delivered') {
  if (!notification) return [];
  const occurredAt = new Date().toISOString();
  return [{
    id: `event-${notification.id}-${lifecycleType}-${Date.now()}`,
    provider: notification.provider_label || 'manual',
    event_type: lifecycleType,
    notification_id: notification.id,
    provider_message_id: notification.provider_message_id || null,
    route_target: notification.route_target || '',
    occurred_at: occurredAt,
    detail: `Simulated ${lifecycleType} lifecycle event from Notification Center.`,
    payload: {
      source: 'manual-simulator',
      notification_id: notification.id,
      provider_message_id: notification.provider_message_id || null,
      lifecycleType
    }
  }];
}
