import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildGatewayTarget, getCarrierGatewayStatus } from '../utils/smsGateway';
import { buildSimulatedLifecycleEvents, providerEventToPatch } from '../utils/notificationReconciliation';
import {
  buildNotificationRecords,
  getAutomationRuns,
  getNotificationEvents,
  getNotificationQueue,
  saveAutomationRun,
  saveNotificationEventItems,
  saveNotificationQueue,
  summarizeAutomationRun,
  updateNotificationQueueItem
} from '../utils/automationEngine';

function formatRunRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    ranAt: row.ran_at || row.ranAt || row.created_at || new Date().toISOString(),
    source: row.source || 'supabase',
    summary: {
      title: row.summary_title || row.title || 'Automation run',
      detail: row.summary_detail || row.detail || ''
    },
    counts: row.counts || {}
  };
}

function formatNotificationRow(row) {
  return {
    id: row.id,
    run_id: row.run_id,
    user_id: row.user_id || null,
    role_scope: row.role_scope || 'All',
    channel: row.channel,
    territory_id: row.territory_id,
    territory_no: row.territory_no,
    locality: row.locality,
    threshold: row.threshold,
    days_in_pool: row.days_in_pool,
    message: row.message,
    status: row.status || 'queued',
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    delivery_detail: row.delivery_detail || '',
    route_target: row.route_target || '',
    fallback_channel: row.fallback_channel || null,
    gateway_type: row.gateway_type || row.channel,
    provider_label: row.provider_label || '',
    attempt_count: Number(row.attempt_count || 0),
    provider_message_id: row.provider_message_id || null,
    last_attempt_at: row.last_attempt_at || null,
    failure_reason: row.failure_reason || null,
    delivery_state: row.delivery_state || (row.status === 'dispatched' ? 'sent' : (row.status === 'failed' ? 'bounced' : 'queued')),
    delivery_state_at: row.delivery_state_at || row.last_attempt_at || null,
    delivered_at: row.delivered_at || null,
    opened_at: row.opened_at || null,
    clicked_at: row.clicked_at || null,
    bounced_at: row.bounced_at || null,
    provider_payload: row.provider_payload || null
  };
}

function formatNotificationEventRow(row) {
  return {
    id: row.id,
    notification_id: row.notification_id || null,
    provider_message_id: row.provider_message_id || null,
    provider: row.provider || row.provider_label || 'provider',
    event_type: row.event_type || row.type || 'unknown',
    route_target: row.route_target || '',
    detail: row.detail || row.delivery_detail || '',
    occurred_at: row.occurred_at || row.created_at || new Date().toISOString(),
    payload: row.payload || null
  };
}

async function fetchRoutingUsers() {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, email, role, phone_number, carrier, sms_gateway_opt_in, sms_gateway_status, sms_gateway_last_checked_at, preferred_notification_method, is_approved')
      .in('role', ['Admin', 'Conductor']);
    if (error) throw error;
    return (data || []).filter((user) => user.is_approved !== false);
  } catch {
    return [];
  }
}

async function suppressFailingGateway(user) {
  if (!user?.user_id) return false;
  try {
    const { error } = await supabase
      .from('user_roles')
      .update({
        sms_gateway_status: 'failing',
        sms_gateway_last_checked_at: new Date().toISOString()
      })
      .eq('user_id', user.user_id);
    return !error;
  } catch {
    return false;
  }
}

export function useAutomationCenter({ state, settings, sourceTag, targets = [], providers = [] }) {
  const [runs, setRuns] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [events, setEvents] = useState([]);
  const [source, setSource] = useState('local');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [runsRes, notificationsRes, eventsRes] = await Promise.all([
        supabase.from('automation_runs').select('*').order('ran_at', { ascending: false }).limit(40),
        supabase.from('notification_queue').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('notification_events').select('*').order('occurred_at', { ascending: false }).limit(200)
      ]);
      const firstError = [runsRes.error, notificationsRes.error, eventsRes.error].find(Boolean);
      if (firstError) throw firstError;
      setRuns((runsRes.data || []).map(formatRunRow));
      setNotifications((notificationsRes.data || []).map(formatNotificationRow));
      setEvents((eventsRes.data || []).map(formatNotificationEventRow));
      setSource('supabase');
    } catch {
      setRuns(getAutomationRuns());
      setNotifications(getNotificationQueue());
      setEvents(getNotificationEvents());
      setSource('local');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summaryCounts = useMemo(() => ({
    queued: notifications.filter((item) => item.status === 'queued').length,
    dispatched: notifications.filter((item) => item.status === 'dispatched').length,
    acknowledged: notifications.filter((item) => item.status === 'acknowledged').length,
    failed: notifications.filter((item) => item.status === 'failed').length
  }), [notifications]);

  const executeRun = useCallback(async (kind) => {
    setBusy(true);
    try {
      const summary = summarizeAutomationRun(kind, state);
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const runRecord = {
        id: runId,
        kind,
        ran_at: new Date().toISOString(),
        source: sourceTag,
        summary_title: summary.title,
        summary_detail: summary.detail,
        counts: {
          dueAlerts: state.dueAlerts.length,
          notifications: state.notificationQueue.length,
          enrichmentDue: state.enrichmentDue.length
        }
      };

      const routingUsers = await fetchRoutingUsers();
      const notificationsForRun = buildNotificationRecords(state, runId, settings.expirationChannels || [], targets, routingUsers).map((item) => ({
        ...item,
        delivery_targets: targets
          .filter((target) => target.active && target.channel === item.channel)
          .map((target) => ({ id: target.id, label: target.label, destination: target.destination, role_scope: target.role_scope })),
        delivery_state: item.delivery_state || 'queued',
        delivery_state_at: item.delivery_state_at || null,
        provider_payload: item.provider_payload || null
      }));

      let deliveryDetail = targets.length
        ? `Queued for ${targets.filter((target) => target.active).length} active delivery targets.`
        : 'No active delivery targets configured. Local execution preview only.';
      try {
        const { data, error } = await supabase.functions.invoke('automation-sweep', {
          body: {
            kind,
            settings,
            source: sourceTag,
            run: runRecord,
            notifications: notificationsForRun,
            targets
          }
        });
        if (!error && data) {
          deliveryDetail = data.message || 'Edge function executed.';
        }
      } catch {
        // optional edge function, ignore
      }

      let dispatchResults = [];
      try {
        const { data, error } = await supabase.functions.invoke('notification-dispatch', {
          body: {
            run: runRecord,
            notifications: notificationsForRun,
            targets,
            providers,
            settings
          }
        });
        if (!error && data?.message) {
          deliveryDetail = `${deliveryDetail} ${data.message}`.trim();
        }
        if (!error && Array.isArray(data?.results)) {
          dispatchResults = data.results;
        }
      } catch {
        // optional edge function, ignore
      }

      const dispatchMap = new Map(dispatchResults.map((item) => [item.id, item]));
      const persistedNotifications = notificationsForRun.map((item) => {
        const result = dispatchMap.get(item.id);
        const nextAttemptCount = Number(item.attempt_count || 0) + (result ? 1 : 0);
        return {
          ...item,
          status: result?.status === 'accepted' ? 'dispatched' : (result?.status === 'failed' ? 'failed' : item.status),
          delivery_state: result?.status === 'accepted' ? 'sent' : (result?.status === 'failed' ? 'bounced' : (item.delivery_state || 'queued')),
          delivery_state_at: result ? new Date().toISOString() : item.delivery_state_at || null,
          delivery_detail: result?.detail || deliveryDetail || item.delivery_detail,
          provider_message_id: result?.provider_message_id || item.provider_message_id || null,
          route_target: result?.route_target || item.route_target || '',
          attempt_count: nextAttemptCount,
          last_attempt_at: result ? new Date().toISOString() : item.last_attempt_at,
          failure_reason: result?.failure_reason || null,
          updated_at: new Date().toISOString(),
          provider_payload: result || item.provider_payload || null
        };
      });

      const failedGatewayUsers = routingUsers.filter((user) => {
        const gateway = buildGatewayTarget(user);
        if (!gateway || getCarrierGatewayStatus(user) === 'failing') return false;
        const related = persistedNotifications.filter((item) => item.user_id === user.user_id && item.channel === 'email_to_sms');
        if (!related.length) return false;
        const failureCount = related.filter((item) => item.status === 'failed').length;
        return settings.disableFailingGateways && failureCount >= 1;
      });
      await Promise.all(failedGatewayUsers.map((user) => suppressFailingGateway(user)));

      const supaRun = { ...runRecord, delivery_detail: deliveryDetail };
      try {
        const { error: runError } = await supabase.from('automation_runs').insert(supaRun);
        if (runError) throw runError;
        if (persistedNotifications.length) {
          const { error: notifError } = await supabase.from('notification_queue').upsert(
            persistedNotifications,
            { onConflict: 'id' }
          );
          if (notifError) throw notifError;
        }
        await load();
        setSource('supabase');
        return { ok: true, summary, deliveryDetail, source: 'supabase', dispatchResults };
      } catch {
        const localRuns = saveAutomationRun({
          id: runId,
          kind,
          ranAt: runRecord.ran_at,
          source: sourceTag,
          summary,
          counts: runRecord.counts
        });
        const localNotifications = saveNotificationQueue(persistedNotifications.length ? persistedNotifications : notificationsForRun.map((item) => ({ ...item, delivery_detail: deliveryDetail })));
        setRuns(localRuns);
        setNotifications(localNotifications);
        setSource('local');
        return { ok: false, summary, deliveryDetail, source: 'local' };
      }
    } finally {
      setBusy(false);
    }
  }, [state, settings, sourceTag, targets, providers, load]);

  const dispatchNotifications = useCallback(async (items, mode = 'selected') => {
    const queueItems = (Array.isArray(items) ? items : notifications.filter((item) => item.status === 'queued'))
      .map((item) => ({ ...item }));
    if (!queueItems.length) return { ok: true, source, results: [], message: 'No notifications selected.' };

    setBusy(true);
    try {
      let dispatchResults = [];
      let message = 'Dispatch preview completed locally.';
      try {
        const { data, error } = await supabase.functions.invoke('notification-dispatch', {
          body: {
            mode,
            notifications: queueItems,
            targets,
            providers,
            settings
          }
        });
        if (error) throw error;
        dispatchResults = Array.isArray(data?.results) ? data.results : [];
        if (data?.message) message = data.message;
      } catch {
        dispatchResults = queueItems.map((item) => ({
          id: item.id,
          status: item.route_target ? 'accepted' : 'failed',
          route_target: item.route_target || '',
          provider_message_id: item.route_target ? `${item.channel}-${Math.random().toString(36).slice(2, 10)}` : null,
          failure_reason: item.route_target ? null : 'No route target was available.',
          detail: item.route_target ? 'Accepted by local dispatch fallback.' : 'Rejected by local dispatch fallback.'
        }));
      }

      const resultMap = new Map(dispatchResults.map((item) => [item.id, item]));
      const updated = notifications.map((item) => {
        const result = resultMap.get(item.id);
        if (!result) return item;
        const nextAttemptCount = Number(item.attempt_count || 0) + 1;
        return {
          ...item,
          status: result.status === 'accepted' ? 'dispatched' : 'failed',
          delivery_state: result.status === 'accepted' ? 'sent' : 'bounced',
          delivery_state_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          route_target: result.route_target || item.route_target || '',
          provider_message_id: result.provider_message_id || item.provider_message_id || null,
          attempt_count: nextAttemptCount,
          last_attempt_at: new Date().toISOString(),
          failure_reason: result.failure_reason || null,
          delivery_detail: result.detail || item.delivery_detail || '',
          provider_payload: result || item.provider_payload || null
        };
      });

      const failedGatewayUserIds = updated
        .filter((item) => item.channel === 'email_to_sms' && item.status === 'failed' && item.user_id)
        .reduce((acc, item) => acc.add(item.user_id), new Set());

      if (settings.disableFailingGateways && failedGatewayUserIds.size) {
        await Promise.all([...failedGatewayUserIds].map((userId) =>
          suppressFailingGateway({ user_id: userId })
        ));
      }

      try {
        const changed = updated.filter((item) => resultMap.has(item.id));
        if (changed.length) {
          const { error } = await supabase.from('notification_queue').upsert(changed, { onConflict: 'id' });
          if (error) throw error;
        }
        setNotifications(updated);
        setSource('supabase');
        return { ok: true, source: 'supabase', results: dispatchResults, message };
      } catch {
        const local = saveNotificationQueue(updated);
        setNotifications(local);
        setSource('local');
        return { ok: false, source: 'local', results: dispatchResults, message };
      }
    } finally {
      setBusy(false);
    }
  }, [notifications, providers, settings, source, targets]);

  const updateNotificationStatus = useCallback(async (id, patch) => {
    const existing = notifications.find((item) => item.id === id);
    const nextPatch = {
      ...patch,
      updated_at: new Date().toISOString(),
      attempt_count: patch.status === 'failed'
        ? Number(existing?.attempt_count || 0) + 1
        : Number(existing?.attempt_count || 0),
      last_attempt_at: patch.status === 'failed' || patch.status === 'dispatched'
        ? new Date().toISOString()
        : existing?.last_attempt_at || null,
      delivery_state: patch.delivery_state || (patch.status === 'failed' ? 'bounced' : (patch.status === 'dispatched' ? 'sent' : existing?.delivery_state || 'queued')),
      delivery_state_at: patch.delivery_state || patch.status === 'failed' || patch.status === 'dispatched'
        ? new Date().toISOString()
        : existing?.delivery_state_at || null,
      failure_reason: patch.status === 'failed' ? (patch.failure_reason || 'Marked failed by operator.') : (patch.failure_reason ?? existing?.failure_reason ?? null)
    };

    try {
      const { error } = await supabase.from('notification_queue').update(nextPatch).eq('id', id);
      if (error) throw error;
      if (nextPatch.status === 'failed' && existing?.channel === 'email_to_sms' && existing?.user_id && settings.disableFailingGateways && nextPatch.attempt_count >= 3) {
        await suppressFailingGateway({ user_id: existing.user_id });
      }
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, ...nextPatch } : item));
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch {
      const next = updateNotificationQueueItem(id, nextPatch);
      setNotifications(next);
      setSource('local');
      return { ok: false, source: 'local' };
    }
  }, [notifications, settings.disableFailingGateways]);

  const reconcileNotifications = useCallback(async (eventsInput, mode = 'manual') => {
    const pendingEvents = (Array.isArray(eventsInput) ? eventsInput : []).map((event) => ({
      provider: 'manual',
      occurred_at: new Date().toISOString(),
      ...event
    }));
    if (!pendingEvents.length) {
      return { ok: true, source, events: [], message: 'No provider events were available.' };
    }

    setBusy(true);
    try {
      let reconciliationResults = [];
      let message = 'Lifecycle events reconciled locally.';
      try {
        const { data, error } = await supabase.functions.invoke('notification-reconcile', {
          body: { mode, events: pendingEvents }
        });
        if (error) throw error;
        reconciliationResults = Array.isArray(data?.results) ? data.results : [];
        if (data?.message) message = data.message;
      } catch {
        reconciliationResults = pendingEvents.map((event) => ({
          ...event,
          status: 'applied',
          patch: providerEventToPatch(event)
        }));
      }

      const resultMap = new Map(reconciliationResults.map((item) => [item.notification_id || item.notificationId, item]));
      const nextNotifications = notifications.map((item) => {
        const result = resultMap.get(item.id);
        if (!result) return item;
        const patch = result.patch || providerEventToPatch(result);
        return {
          ...item,
          ...patch,
          updated_at: new Date().toISOString(),
          provider_message_id: result.provider_message_id || item.provider_message_id || null
        };
      });

      const normalizedEvents = reconciliationResults.map((event, idx) => formatNotificationEventRow({
        id: event.id || `reconcile-${Date.now()}-${idx}`,
        notification_id: event.notification_id || event.notificationId || null,
        provider_message_id: event.provider_message_id || null,
        provider: event.provider || 'manual',
        event_type: event.event_type || event.type || 'unknown',
        route_target: event.route_target || '',
        detail: event.detail || event.message || 'Lifecycle event processed.',
        occurred_at: event.occurred_at || new Date().toISOString(),
        payload: event.payload || null
      }));

      try {
        const changed = nextNotifications.filter((item) => resultMap.has(item.id));
        if (changed.length) {
          const { error } = await supabase.from('notification_queue').upsert(changed, { onConflict: 'id' });
          if (error) throw error;
        }
        if (normalizedEvents.length) {
          const { error } = await supabase.from('notification_events').upsert(normalizedEvents, { onConflict: 'id' });
          if (error) throw error;
        }
        setNotifications(nextNotifications);
        setEvents((current) => [...normalizedEvents, ...current].slice(0, 200));
        setSource('supabase');
        return { ok: true, source: 'supabase', events: normalizedEvents, message, results: reconciliationResults };
      } catch {
        const localNotifications = saveNotificationQueue(nextNotifications);
        const localEvents = saveNotificationEventItems(normalizedEvents);
        setNotifications(localNotifications);
        setEvents(localEvents);
        setSource('local');
        return { ok: false, source: 'local', events: normalizedEvents, message, results: reconciliationResults };
      }
    } finally {
      setBusy(false);
    }
  }, [notifications, source]);

  const simulateLifecycle = useCallback(async (notification, lifecycleType) => {
    return reconcileNotifications(buildSimulatedLifecycleEvents(notification, lifecycleType), 'manual-simulated');
  }, [reconcileNotifications]);

  return { runs, notifications, events, source, busy, summaryCounts, executeRun, dispatchNotifications, updateNotificationStatus, reconcileNotifications, simulateLifecycle, refresh: load };
}
