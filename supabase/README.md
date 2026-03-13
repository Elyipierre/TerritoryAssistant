# Supabase Backend Scaffolding

This project includes backend-ready scaffolding for Territory Assistant notification automation.

## Migrations

Run the migration in `supabase/migrations/20260309_notification_backend.sql` to create:

- `notification_targets`
- `notification_providers`
- `automation_runs`
- `notification_queue`
- user notification routing columns on `user_roles`

## Edge Functions

### automation-sweep
Receives automation execution payloads and returns an execution acknowledgment.

### notification-dispatch
Dispatches notification queue items using active provider profiles.

Current behavior:
- `in_app` -> accepted internally
- `email` / `email_to_sms` with `provider_type = resend` -> sends through Resend if `RESEND_API_KEY` is configured
- unsupported carrier gateways are rejected explicitly
- if no provider profile is active for a channel, dispatch is rejected cleanly

Required secrets for live Resend delivery:
- `RESEND_API_KEY`

Recommended provider setup in the app:
- one active `email` provider profile using `resend`
- one active `email_to_sms` provider profile using `resend`
- sender identity set to a verified Resend sender address

### notification-reconcile
Receives delivery lifecycle updates from provider callbacks or later polling/reconciliation jobs.

## Security Guidance

Do **not** place provider secrets in the frontend.

Keep secrets only in Supabase Edge Function secrets, for example:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
```

## Next Steps

Recommended production follow-up:
1. Deploy `notification-dispatch` and `notification-reconcile`
2. Configure a verified Resend sender
3. Route provider webhook callbacks into `notification-reconcile`
4. Persist webhook-delivered status updates back into `notification_queue`

## Webhook reconciliation

The `notification-reconcile` Edge Function is designed to receive provider lifecycle callbacks such as:
- sent / processed / accepted
- delivered
- opened
- clicked
- bounced / complained / failed

Recommended setup:
1. Deploy `notification-reconcile`
2. Point your email provider webhook to the function URL
3. Include `provider_message_id` in callback payloads, or `notification_id` in provider metadata when supported
4. The function will upsert `notification_events` and patch matching `notification_queue` rows

For providers like Resend, configure webhook delivery to the function endpoint and ensure the callback includes the provider message identifier returned at send time.


## Provider webhook reconciliation

The `notification-reconcile` function now understands two event shapes:

- generic provider payloads that include fields like `provider`, `event_type`, `notification_id`, and `provider_message_id`
- Resend-style webhook payloads where lifecycle data is nested under `data` and correlation metadata is carried in `data.metadata.notification_id` or `data.tags.notification_id`

When a provider callback is reconciled, the function will:
- update `notification_queue` lifecycle fields such as `delivery_state`, `delivered_at`, `opened_at`, `clicked_at`, and `bounced_at`
- append the raw event into `notification_events` for auditing
- preserve the original provider payload in `provider_payload`
