import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type NotificationRecord = {
  id: string;
  channel: string;
  route_target?: string;
  provider_label?: string;
  message?: string;
  territory_no?: string;
};

type ProviderProfile = {
  id: string;
  channel: string;
  provider_type: string;
  sender_identity?: string;
  active?: boolean;
  label?: string;
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const RESEND_API_URL = 'https://api.resend.com/emails';

function isUnsupportedGatewayTarget(target: string) {
  const lower = target.toLowerCase();
  return lower.endsWith('@txt.att.net') || lower.endsWith('@vtext.com') || lower.endsWith('@messaging.sprintpcs.com');
}

function chooseProvider(providers: ProviderProfile[], channel: string) {
  return providers.find((provider) => provider.active !== false && provider.channel === channel) || null;
}

async function sendViaResend(notification: NotificationRecord, provider: ProviderProfile) {
  if (!RESEND_API_KEY) {
    return {
      status: 'failed',
      provider_message_id: null,
      failure_reason: 'RESEND_API_KEY is not configured.',
      detail: 'Dispatch failed because the Resend secret is not configured.'
    };
  }

  const to = String(notification.route_target || '').trim();
  const subject = notification.channel === 'email_to_sms'
    ? ''
    : `Territory Assistant Alert${notification.territory_no ? ` • Territory ${notification.territory_no}` : ''}`;
  const payload = {
    from: provider.sender_identity || 'alerts@example.com',
    to: [to],
    subject,
    text: String(notification.message || '').slice(0, notification.channel === 'email_to_sms' ? 140 : 4000),
    tags: [
      { name: 'notification_id', value: String(notification.id || '') },
      { name: 'territory_no', value: String(notification.territory_no || '') }
    ],
    headers: {
      'X-Territory-Assistant-Notification-Id': String(notification.id || ''),
      'X-Territory-Assistant-Route-Target': String(notification.route_target || '')
    }
  };

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: 'failed',
      provider_message_id: null,
      failure_reason: json?.message || `Resend HTTP ${response.status}`,
      detail: 'Provider rejected the dispatch request.'
    };
  }

  return {
    status: 'accepted',
    provider_message_id: json?.id || `resend-${crypto.randomUUID()}`,
    failure_reason: null,
    detail: notification.channel === 'email_to_sms'
      ? 'Accepted by Resend for best-effort carrier email-to-text delivery.'
      : 'Accepted by Resend email provider.'
  };
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const notifications = Array.isArray(body?.notifications) ? body.notifications as NotificationRecord[] : [];
  const providers = Array.isArray(body?.providers) ? body.providers as ProviderProfile[] : [];

  const results = [] as Array<Record<string, unknown>>;

  for (const notification of notifications) {
    const route = String(notification.route_target || '').trim();
    if (!route) {
      results.push({
        id: notification.id,
        channel: notification.channel,
        status: 'failed',
        provider_message_id: null,
        route_target: '',
        failure_reason: 'No delivery route target was available.',
        detail: 'Dispatch rejected because no route target was configured.'
      });
      continue;
    }

    if (notification.channel === 'email_to_sms' && isUnsupportedGatewayTarget(route)) {
      results.push({
        id: notification.id,
        channel: notification.channel,
        status: 'failed',
        provider_message_id: null,
        route_target: route,
        failure_reason: 'Carrier gateway is deprecated or unsupported.',
        detail: 'Email-to-text route rejected because the carrier gateway is deprecated or unsupported.'
      });
      continue;
    }

    if (notification.channel === 'in_app') {
      results.push({
        id: notification.id,
        channel: notification.channel,
        status: 'accepted',
        provider_message_id: `in-app-${crypto.randomUUID()}`,
        route_target: route,
        failure_reason: null,
        detail: 'Accepted for in-app delivery lifecycle tracking.'
      });
      continue;
    }

    const provider = chooseProvider(providers, notification.channel);
    if (!provider) {
      results.push({
        id: notification.id,
        channel: notification.channel,
        status: 'failed',
        provider_message_id: null,
        route_target: route,
        failure_reason: `No active provider profile configured for ${notification.channel}.`,
        detail: 'Dispatch rejected because no provider profile was available.'
      });
      continue;
    }

    if (provider.provider_type === 'resend') {
      const resendResult = await sendViaResend(notification, provider);
      results.push({
        id: notification.id,
        channel: notification.channel,
        route_target: route,
        provider_label: provider.label || 'Resend',
        ...resendResult
      });
      continue;
    }

    results.push({
      id: notification.id,
      channel: notification.channel,
      status: 'accepted',
      provider_message_id: `${provider.provider_type}-${crypto.randomUUID()}`,
      route_target: route,
      failure_reason: null,
      detail: `Accepted by ${provider.provider_type} dispatch stub.`
    });
  }

  const acceptedCount = results.filter((item) => item.status === 'accepted').length;
  const failedCount = results.filter((item) => item.status === 'failed').length;

  return Response.json({
    ok: true,
    message: `Dispatch processed ${notifications.length} notification(s). ${acceptedCount} accepted, ${failedCount} failed.`,
    results,
    acceptedAt: new Date().toISOString()
  });
});
