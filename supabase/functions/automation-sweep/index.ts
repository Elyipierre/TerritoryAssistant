import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const run = body?.run ?? {};
  const notifications = Array.isArray(body?.notifications) ? body.notifications : [];
  const settings = body?.settings ?? {};

  return Response.json({
    ok: true,
    message: `Automation sweep accepted for ${run.kind || 'manual'} with ${notifications.length} queued notifications.`,
    acceptedAt: new Date().toISOString(),
    channels: settings?.expirationChannels || []
  });
});
