import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type GenericEvent = Record<string, unknown>;

function mapEventType(type: string) {
  const normalized = String(type || '').toLowerCase();
  if (['accepted', 'processed', 'queued', 'sent'].includes(normalized)) {
    return {
      status: 'dispatched',
      delivery_state: 'sent',
      detail: 'Provider accepted the notification for delivery.'
    };
  }
  if (normalized === 'delivered') {
    return {
      status: 'dispatched',
      delivery_state: 'delivered',
      detail: 'Provider confirmed delivery.'
    };
  }
  if (['opened', 'open'].includes(normalized)) {
    return {
      status: 'dispatched',
      delivery_state: 'opened',
      detail: 'Recipient opened the message.'
    };
  }
  if (['clicked', 'click'].includes(normalized)) {
    return {
      status: 'dispatched',
      delivery_state: 'clicked',
      detail: 'Recipient clicked a tracked link.'
    };
  }
  if (['bounced', 'bounce', 'complained', 'complaint', 'failed', 'dropped'].includes(normalized)) {
    return {
      status: 'failed',
      delivery_state: 'bounced',
      detail: 'Provider reported a bounce or complaint.'
    };
  }
  return {
    status: 'dispatched',
    delivery_state: normalized || 'unknown',
    detail: 'Lifecycle event received from provider.'
  };
}

function normalizeResendEvent(event: GenericEvent, body: Record<string, unknown>, index: number) {
  const payload = (event.payload || event) as Record<string, unknown>;
  const data = (payload.data || {}) as Record<string, unknown>;
  const type = String(event.event_type || event.type || payload.type || data.type || 'unknown');
  const occurredAt = String(event.occurred_at || event.created_at || data.created_at || body.created_at || new Date().toISOString());
  const providerMessageId = String(event.provider_message_id || data.email_id || data.created_email_id || '') || null;
  const notificationId = String(event.notification_id || (data.metadata as Record<string, unknown> | undefined)?.notification_id || (data.tags as Record<string, unknown> | undefined)?.notification_id || '') || null;
  const patch = mapEventType(type);
  return {
    id: String(event.id || `evt-${Date.now()}-${index}`),
    provider: 'resend',
    event_type: type,
    occurred_at: occurredAt,
    provider_message_id: providerMessageId,
    notification_id: notificationId,
    route_target: String(event.route_target || data.to || ''),
    detail: String(event.detail || data.response || patch.detail || ''),
    payload,
    patch: {
      ...patch,
      delivery_state_at: occurredAt,
      delivered_at: patch.delivery_state === 'delivered' ? occurredAt : null,
      opened_at: patch.delivery_state === 'opened' ? occurredAt : null,
      clicked_at: patch.delivery_state === 'clicked' ? occurredAt : null,
      bounced_at: patch.delivery_state === 'bounced' ? occurredAt : null,
      failure_reason: patch.delivery_state === 'bounced' ? String(event.failure_reason || event.reason || data.reason || 'Provider reported a bounce or complaint.') : null,
      provider_payload: payload,
      updated_at: new Date().toISOString()
    }
  };
}

function normalizeGenericEvent(event: GenericEvent, body: Record<string, unknown>, index: number) {
  const provider = String(event.provider || body.provider || 'provider');
  const type = String(event.event_type || event.type || 'unknown');
  const occurredAt = String(event.occurred_at || event.created_at || new Date().toISOString());
  const providerMessageId = String(event.provider_message_id || '') || null;
  const notificationId = String(event.notification_id || '') || null;
  const patch = mapEventType(type);
  return {
    id: String(event.id || `evt-${Date.now()}-${index}`),
    provider,
    event_type: type,
    occurred_at: occurredAt,
    provider_message_id: providerMessageId,
    notification_id: notificationId,
    route_target: String(event.route_target || ''),
    detail: String(event.detail || patch.detail || ''),
    payload: event,
    patch: {
      ...patch,
      delivery_state_at: occurredAt,
      delivered_at: patch.delivery_state === 'delivered' ? occurredAt : null,
      opened_at: patch.delivery_state === 'opened' ? occurredAt : null,
      clicked_at: patch.delivery_state === 'clicked' ? occurredAt : null,
      bounced_at: patch.delivery_state === 'bounced' ? occurredAt : null,
      failure_reason: patch.delivery_state === 'bounced' ? String(event.failure_reason || event.reason || 'Provider reported a bounce or complaint.') : null,
      provider_payload: event,
      updated_at: new Date().toISOString()
    }
  };
}

function normalizeIncomingEvents(body: Record<string, unknown>) {
  const rawEvents = Array.isArray(body?.events)
    ? body.events as GenericEvent[]
    : body?.type || body?.provider || body?.data
    ? [body as GenericEvent]
    : [];

  return rawEvents.map((event, index) => {
    const provider = String(event.provider || body.provider || '').toLowerCase();
    const looksLikeResend = provider === 'resend' || Boolean((event as any)?.payload?.data?.email_id) || Boolean((event as any)?.data?.email_id) || Boolean((event as any)?.data?.created_email_id);
    return looksLikeResend
      ? normalizeResendEvent(event, body, index)
      : normalizeGenericEvent(event, body, index);
  });
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const events = normalizeIncomingEvents(body as Record<string, unknown>);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({
      ok: true,
      reconciled: events.length,
      message: events.length
        ? `Prepared ${events.length} notification lifecycle update(s) for reconciliation.`
        : 'No lifecycle updates were supplied.',
      results: events,
      receivedAt: new Date().toISOString()
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const results: Array<Record<string, unknown>> = [];

  for (const event of events) {
    let queueRow: Record<string, unknown> | null = null;
    if (event.notification_id) {
      const { data } = await admin.from('notification_queue').select('*').eq('id', event.notification_id).maybeSingle();
      queueRow = data;
    }
    if (!queueRow && event.provider_message_id) {
      const { data } = await admin.from('notification_queue').select('*').eq('provider_message_id', event.provider_message_id).maybeSingle();
      queueRow = data;
    }

    const notificationId = String(event.notification_id || queueRow?.id || '');
    if (notificationId) {
      await admin.from('notification_queue').update(event.patch).eq('id', notificationId);
    }

    await admin.from('notification_events').upsert({
      id: event.id,
      notification_id: notificationId || null,
      provider_message_id: event.provider_message_id,
      provider: event.provider,
      event_type: event.event_type,
      route_target: event.route_target,
      detail: event.detail,
      payload: event.payload,
      occurred_at: event.occurred_at
    }, { onConflict: 'id' });

    results.push({
      id: event.id,
      notification_id: notificationId || null,
      provider_message_id: event.provider_message_id,
      provider: event.provider,
      event_type: event.event_type,
      route_target: event.route_target,
      detail: event.detail,
      occurred_at: event.occurred_at,
      patch: event.patch,
      status: notificationId ? 'applied' : 'unmatched'
    });
  }

  return Response.json({
    ok: true,
    reconciled: results.length,
    matched: results.filter((item) => item.status === 'applied').length,
    unmatched: results.filter((item) => item.status === 'unmatched').length,
    message: results.length
      ? `Reconciled ${results.length} provider lifecycle event(s).`
      : 'No lifecycle updates were supplied.',
    results,
    receivedAt: new Date().toISOString()
  });
});
