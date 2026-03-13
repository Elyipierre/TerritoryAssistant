const RUN_STORAGE_KEY = 'territory-assistant-automation-runs';
const NOTIFICATION_STORAGE_KEY = 'territory-assistant-notification-queue';
const NOTIFICATION_EVENTS_KEY = 'territory-assistant-notification-events';

function normalizeTerritoryId(territory) {
  return String(territory?.id ?? territory?.territoryNo ?? territory?.territory_id ?? '');
}

function diffDays(fromIso, now = new Date()) {
  if (!fromIso) return null;
  const start = new Date(fromIso);
  if (Number.isNaN(start.getTime())) return null;
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

function latestActionMap(history = []) {
  const map = new Map();
  history.forEach((row) => {
    const key = String(row.territory_id ?? row.territoryId ?? '');
    const value = row.action_date || row.created_at || row.updated_at;
    if (!key || !value) return;
    const existing = map.get(key);
    if (!existing || new Date(value) > new Date(existing)) {
      map.set(key, value);
    }
  });
  return map;
}

function getAnchorDate(territory, actionDates) {
  return territory?.enabled_at
    || territory?.enabledAt
    || territory?.pool_entered_at
    || territory?.poolEnteredAt
    || territory?.updated_at
    || territory?.created_at
    || actionDates.get(normalizeTerritoryId(territory))
    || null;
}

function nextEnrichmentDate(territory) {
  const source = territory?.lastFetchedAt || territory?.last_fetched_at || territory?.enriched_at;
  if (!source) return null;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return null;
  date.setMonth(date.getMonth() + 6);
  return date.toISOString();
}

function readStorage(key, fallback = []) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function evaluateAutomationState({ territories = [], history = [], settings = {}, now = new Date() }) {
  const actionDates = latestActionMap(history);
  const thresholds = [settings.expirationAlertDay1, settings.expirationAlertDay2, settings.expirationAlertDay3]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const enabledTerritories = territories.filter((territory) => territory.is_enabled);

  const expirationItems = enabledTerritories
    .map((territory) => {
      const territoryId = normalizeTerritoryId(territory);
      const anchorDate = getAnchorDate(territory, actionDates);
      const daysInPool = diffDays(anchorDate, now);
      const reachedThresholds = thresholds.filter((threshold) => daysInPool != null && daysInPool >= threshold);
      const nextThreshold = thresholds.find((threshold) => daysInPool == null || daysInPool < threshold) ?? null;
      return {
        territoryId,
        territoryNo: territory.territoryNo ?? territoryId,
        locality: territory.locality ?? territory.city ?? 'Territory',
        anchorDate,
        daysInPool,
        reachedThresholds,
        nextThreshold,
        status: reachedThresholds.length ? 'due' : (daysInPool != null ? 'watch' : 'unknown')
      };
    })
    .sort((a, b) => (b.daysInPool ?? -1) - (a.daysInPool ?? -1));

  const dueAlerts = expirationItems.filter((item) => item.reachedThresholds.length);
  const dueSoon = expirationItems.filter((item) => !item.reachedThresholds.length && item.nextThreshold != null && item.daysInPool != null && item.nextThreshold - item.daysInPool <= 7);

  const notificationQueue = dueAlerts.flatMap((item) => (settings.expirationChannels || ['email']).map((channel) => ({
    id: `${channel}-${item.territoryId}-${item.reachedThresholds.join('-')}`,
    channel,
    territoryId: item.territoryId,
    territoryNo: item.territoryNo,
    locality: item.locality,
    threshold: item.reachedThresholds.at(-1),
    daysInPool: item.daysInPool,
    message: `Territory ${item.territoryNo} has been enabled for ${item.daysInPool} days and has crossed the ${item.reachedThresholds.at(-1)}-day threshold.`
  })));

  const enrichment = territories.map((territory) => {
    const territoryId = normalizeTerritoryId(territory);
    const dueDate = nextEnrichmentDate(territory);
    const overdue = dueDate ? diffDays(dueDate, now) : null;
    return {
      territoryId,
      territoryNo: territory.territoryNo ?? territoryId,
      locality: territory.locality ?? territory.city ?? 'Territory',
      lastFetchedAt: territory.lastFetchedAt || territory.last_fetched_at || territory.enriched_at || null,
      dueDate,
      overdueDays: overdue,
      isDue: overdue != null && overdue >= 0
    };
  }).filter((item) => item.lastFetchedAt).sort((a, b) => (b.overdueDays ?? -999) - (a.overdueDays ?? -999));

  const coVisitActive = Boolean(settings.coVisitModeEnabled && settings.coVisitStart && settings.coVisitEnd && now >= new Date(settings.coVisitStart) && now <= new Date(settings.coVisitEnd));

  return {
    thresholds,
    expirationItems,
    dueAlerts,
    dueSoon,
    notificationQueue,
    enrichmentDue: enrichment.filter((item) => item.isDue),
    enrichmentWatch: enrichment.filter((item) => !item.isDue).slice(0, 12),
    coVisitActive,
    coVisitSummary: coVisitActive
      ? `CO visit mode is active${settings.coRestrictTelephone ? '; telephone witnessing is restricted.' : '.'}${settings.coForceInitialCalls ? ' Enabled territories should default to Initial Call.' : ''}`
      : (settings.coVisitModeEnabled ? 'CO visit mode is scheduled but not currently active.' : 'CO visit mode is disabled.'),
    executionReady: Boolean((settings.expirationChannels || []).length || settings.coVisitModeEnabled)
  };
}

export function getAutomationRuns() {
  return readStorage(RUN_STORAGE_KEY, []);
}

export function saveAutomationRun(run) {
  const current = getAutomationRuns();
  const next = [{ id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...run }, ...current].slice(0, 60);
  writeStorage(RUN_STORAGE_KEY, next);
  return next;
}


export function getNotificationEvents() {
  return readStorage(NOTIFICATION_EVENTS_KEY, []);
}

export function saveNotificationEventItems(items = []) {
  const current = getNotificationEvents();
  const nextMap = new Map(current.map((item) => [item.id, item]));
  items.forEach((item) => nextMap.set(item.id, item));
  const next = [...nextMap.values()]
    .sort((a, b) => new Date(b.occurred_at || b.created_at || 0) - new Date(a.occurred_at || a.created_at || 0))
    .slice(0, 500);
  writeStorage(NOTIFICATION_EVENTS_KEY, next);
  return next;
}

export function getNotificationQueue() {
  return readStorage(NOTIFICATION_STORAGE_KEY, []);
}

export function saveNotificationQueue(items = []) {
  const current = getNotificationQueue();
  const nextMap = new Map(current.map((item) => [item.id, item]));
  items.forEach((item) => nextMap.set(item.id, item));
  const next = [...nextMap.values()]
    .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0))
    .slice(0, 300);
  writeStorage(NOTIFICATION_STORAGE_KEY, next);
  return next;
}

export function updateNotificationQueueItem(id, patch) {
  const next = getNotificationQueue().map((item) => item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item);
  writeStorage(NOTIFICATION_STORAGE_KEY, next);
  return next;
}

function expandTargetRecipients(target, users = [], channel) {
  const scoped = users.filter((user) => {
    if (!target?.role_scope || target.role_scope === 'All') return true;
    return user.role === target.role_scope;
  });

  if (target?.destination) {
    return [{
      target_id: target.id,
      target_label: target.label,
      role_scope: target.role_scope || 'All',
      route_target: target.destination,
      user_id: null,
      email: null,
      channel
    }];
  }

  return scoped.flatMap((user) => {
    if (channel === 'email') {
      return user.email ? [{
        target_id: target.id,
        target_label: target.label,
        role_scope: target.role_scope || 'All',
        route_target: user.email,
        user_id: user.user_id,
        email: user.email,
        channel
      }] : [];
    }

    if (channel === 'email_to_sms') {
      const gateway = buildGatewayTarget(user);
      if (!gateway || !user.sms_gateway_opt_in || getCarrierGatewayStatus(user) === 'failing') return [];
      return [{
        target_id: target.id,
        target_label: target.label,
        role_scope: target.role_scope || 'All',
        route_target: gateway.target,
        user_id: user.user_id,
        email: user.email,
        channel,
        gateway_reliability: gateway.reliability,
        gateway_carrier: gateway.carrier
      }];
    }

    return [];
  });
}

export function buildNotificationRecords(state, runId, channels = [], targets = [], users = []) {
  const now = new Date().toISOString();
  const allowed = channels.length ? new Set(channels) : null;

  return state.notificationQueue
    .filter((item) => !allowed || allowed.has(item.channel))
    .flatMap((item) => {
      const matchingTargets = targets.filter((target) => target.active && target.channel === item.channel);
      const recipients = matchingTargets.flatMap((target) => expandTargetRecipients(target, users, item.channel));
      const fallbackRecipients = item.channel === 'email' && !recipients.length
        ? users
            .filter((user) => user.role === 'Conductor' || user.role === 'Admin')
            .filter((user) => user.email)
            .map((user) => ({
              target_id: 'derived-email',
              target_label: 'Derived email route',
              role_scope: user.role,
              route_target: user.email,
              user_id: user.user_id,
              email: user.email,
              channel: 'email'
            }))
        : [];
      const allRecipients = [...recipients, ...fallbackRecipients];

      if (!allRecipients.length) {
        return [{
          id: `notification-${runId}-${item.channel}-${item.territoryId}-${item.threshold}`,
          run_id: runId,
          user_id: null,
          role_scope: 'All',
          channel: item.channel,
          territory_id: item.territoryId,
          territory_no: item.territoryNo,
          locality: item.locality,
          threshold: item.threshold,
          days_in_pool: item.daysInPool,
          message: item.message,
          status: 'queued',
          created_at: now,
          updated_at: now,
          fallback_channel: item.channel === 'email_to_sms' ? 'email' : null,
          gateway_type: item.channel === 'email_to_sms' ? 'carrier-gateway' : item.channel,
          provider_label: item.channel === 'email_to_sms' ? 'carrier gateway' : item.channel,
          route_target: '',
          delivery_detail: item.delivery_detail || 'No eligible delivery route found.',
          delivery_targets: [],
          attempt_count: 0,
          provider_message_id: null,
          last_attempt_at: null,
          failure_reason: null
        }];
      }

      return allRecipients.map((recipient, idx) => ({
        id: `notification-${runId}-${item.channel}-${item.territoryId}-${item.threshold}-${recipient.user_id || recipient.target_id || idx}`,
        run_id: runId,
        user_id: recipient.user_id,
        role_scope: recipient.role_scope || 'All',
        channel: item.channel,
        territory_id: item.territoryId,
        territory_no: item.territoryNo,
        locality: item.locality,
        threshold: item.threshold,
        days_in_pool: item.daysInPool,
        message: item.message,
        status: 'queued',
        created_at: now,
        updated_at: now,
        fallback_channel: item.channel === 'email_to_sms' ? 'email' : null,
        gateway_type: item.channel === 'email_to_sms' ? 'carrier-gateway' : item.channel,
        provider_label: item.channel === 'email_to_sms' ? 'carrier gateway' : item.channel,
        route_target: recipient.route_target || '',
        delivery_detail: item.delivery_detail || '',
        delivery_targets: [{ id: recipient.target_id, label: recipient.target_label, destination: recipient.route_target, role_scope: recipient.role_scope || 'All' }],
        attempt_count: 0,
        provider_message_id: null,
        last_attempt_at: null,
        failure_reason: null
      }));
    });
}


export function evaluateGatewayRoster(users = []) {
  const rows = users
    .filter((user) => user?.role === 'Conductor' || user?.role === 'Admin')
    .map((user) => {
      const gateway = buildGatewayTarget(user);
      const carrierInfo = CARRIER_GATEWAYS[(user?.carrier || '').toLowerCase()] || null;
      return {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        phone_number: user.phone_number || '',
        carrier: user.carrier || '',
        sms_gateway_opt_in: Boolean(user.sms_gateway_opt_in),
        sms_gateway_status: getCarrierGatewayStatus(user) || (carrierInfo?.enabled ? 'active' : (carrierInfo?.reliability || 'unknown')),
        preferred_notification_method: user.preferred_notification_method || 'email',
        gateway_target: gateway?.target || '',
        gateway_supported: Boolean(gateway),
        gateway_reliability: gateway?.reliability || carrierInfo?.reliability || 'unknown'
      };
    });
  return {
    rows,
    enabledCount: rows.filter((row) => row.sms_gateway_opt_in && row.gateway_supported).length,
    failingCount: rows.filter((row) => row.sms_gateway_status === 'failing').length,
    unsupportedCount: rows.filter((row) => row.sms_gateway_status === 'unsupported' || row.sms_gateway_status === 'deprecated').length
  };
}

export function summarizeAutomationRun(kind, state) {
  if (kind === 'expiration') {
    return {
      title: 'Expiration sweep executed',
      detail: `${state.dueAlerts.length} due alerts • ${state.notificationQueue.length} notifications prepared.`
    };
  }
  if (kind === 'enrichment') {
    return {
      title: 'Enrichment audit executed',
      detail: `${state.enrichmentDue.length} territories are due for semi-annual enrichment.`
    };
  }
  if (kind === 'co-sync') {
    return {
      title: 'CO sync executed',
      detail: state.coVisitSummary
    };
  }
  return {
    title: 'Full automation sweep executed',
    detail: `${state.dueAlerts.length} due alerts • ${state.enrichmentDue.length} enrichment items • CO mode ${state.coVisitActive ? 'active' : 'inactive'}.`
  };
}
