import { useMemo, useState } from 'react';
import { useNotificationTargets } from '../hooks/useNotificationTargets';
import { useNotificationProviders } from '../hooks/useNotificationProviders';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import { useOperationalSettings } from '../hooks/useOperationalSettings';
import { useTerritories } from '../hooks/useTerritories';
import { useAssignments } from '../hooks/useAssignments';
import { evaluateAutomationState } from '../utils/automationEngine';
import { useAutomationCenter } from '../hooks/useAutomationCenter';
import { buildNotificationAnalytics } from '../utils/notificationAnalytics';

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

export default function NotificationsPage() {
  const { settings, source: settingsSource } = useOperationalSettings();
  const { territories, source: territorySource } = useTerritories();
  const { history, source: assignmentSource } = useAssignments(null, 'Admin');
  const [filter, setFilter] = useState('all');
  const [targetDraft, setTargetDraft] = useState({ label: '', channel: 'email', destination: '', role_scope: 'Conductor', active: true });
  const [providerDraft, setProviderDraft] = useState({ label: '', channel: 'email', provider_type: 'resend', sender_identity: '', active: true });
  const [message, setMessage] = useState('');
  const [selectedNotificationId, setSelectedNotificationId] = useState('');
  const automationState = useMemo(
    () => evaluateAutomationState({ territories, history, settings }),
    [territories, history, settings]
  );
  const { targets, source: targetSource, saveTarget, deleteTarget } = useNotificationTargets();
  const { providers, activeProviders, source: providerSource, saveProvider, deleteProvider } = useNotificationProviders();
  const { runs, notifications, events, summaryCounts, source, updateNotificationStatus, dispatchNotifications, simulateLifecycle, reconcileNotifications } = useAutomationCenter({
    state: automationState,
    settings,
    sourceTag: `${settingsSource}/${territorySource}/${assignmentSource}`,
    targets,
    providers
  });

  const filtered = notifications.filter((item) => filter === 'all' || item.status === filter);
  const queuedVisible = filtered.filter((item) => item.status === 'queued');
  const failedVisible = filtered.filter((item) => item.status === 'failed');
  const selectedNotification = notifications.find((item) => item.id === selectedNotificationId) || filtered[0] || notifications[0] || null;
  const analytics = useMemo(() => buildNotificationAnalytics(notifications, events), [notifications, events]);

  async function mark(id, status) {
    await updateNotificationStatus(id, {
      status,
      delivery_detail: status === 'dispatched'
        ? 'Manually marked dispatched from Notification Center.'
        : status === 'failed'
        ? 'Marked failed from Notification Center.'
        : 'Acknowledged by operator.',
      failure_reason: status === 'failed' ? 'Manual operator failure mark.' : null
    });
  }

  async function saveDeliveryTarget(event) {
    event.preventDefault();
    await saveTarget(targetDraft);
    setTargetDraft({ label: '', channel: 'email', destination: '', role_scope: 'Conductor', active: true });
  }

  async function saveProviderProfile(event) {
    event.preventDefault();
    await saveProvider(providerDraft);
    setProviderDraft({ label: '', channel: 'email', provider_type: 'resend', sender_identity: '', active: true });
  }

  async function toggleTarget(target) {
    await saveTarget({ ...target, active: !target.active });
  }

  async function toggleProvider(provider) {
    await saveProvider({ ...provider, active: !provider.active });
  }

  async function runDispatch(items, mode) {
    const result = await dispatchNotifications(items, mode);
    setMessage(result.message || `Processed ${result.results?.length || 0} notification(s).`);
  }

  async function triggerLifecycle(type) {
    if (!selectedNotification) return;
    const result = await simulateLifecycle(selectedNotification, type);
    setMessage(result.message || `Processed ${result.events?.length || 0} lifecycle event(s).`);
  }

  async function syncOpenReceipts() {
    const result = await reconcileNotifications([], 'sync-preview');
    setMessage(result.message || 'No provider events were available.');
  }

  return (
    <AppShell title="Notification Center" subtitle="Review queued alerts, manage routing, and inspect live dispatch readiness.">
      <div className="kpi-grid">
        <KpiCard label="Queued" value={summaryCounts.queued} helper="Awaiting dispatch" />
        <KpiCard label="Dispatched" value={summaryCounts.dispatched} helper="Sent or manually marked sent" />
        <KpiCard label="Acknowledged" value={summaryCounts.acknowledged} helper="Leadership confirmed receipt" />
        <KpiCard label="Failed" value={summaryCounts.failed} helper="Needs retry or reroute" />
        <KpiCard label="Delivery Targets" value={targets.filter((item) => item.active).length} helper={targetSource === 'supabase' ? 'Live registry' : 'Local fallback'} />
        <KpiCard label="Providers" value={activeProviders.length} helper={providerSource === 'supabase' ? 'Live provider profiles' : 'Local provider profiles'} />
      </div>

      {message ? <p className="muted-copy">{message}</p> : null}

      <div className="kpi-grid">
        <KpiCard label="Delivery Rate" value={`${Math.round((analytics.totals.deliveryRate || 0) * 100)}%`} helper="Delivered / dispatched" />
        <KpiCard label="Open Rate" value={`${Math.round((analytics.totals.openRate || 0) * 100)}%`} helper="Opened / dispatched" />
        <KpiCard label="Failure Rate" value={`${Math.round((analytics.totals.failureRate || 0) * 100)}%`} helper="Failed / total queue" />
        <KpiCard label="Avg Delivery Lag" value={analytics.totals.avgDeliveryLatencyHours != null ? `${analytics.totals.avgDeliveryLatencyHours.toFixed(2)}h` : 'N/A'} helper="Attempt to delivered" />
      </div>

      <div className="grid-panels">
        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Notification Queue</h3>
              <p>Queued alerts can be dispatched in bulk, retried, or manually updated while your backend delivery layer is coming online.</p>
            </div>
            <div className="select-inline action-row">
              <select className="state-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="queued">Queued</option>
                <option value="dispatched">Dispatched</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="failed">Failed</option>
              </select>
              <button className="mini-action" type="button" disabled={!queuedVisible.length} onClick={() => runDispatch(queuedVisible, 'bulk-visible')}>Dispatch Visible Queued</button>
              <button className="mini-action ghost" type="button" disabled={!failedVisible.length} onClick={() => runDispatch(failedVisible, 'retry-failed')}>Retry Failed Visible</button>
            </div>
          </div>
          <div className="stack-list">
            {filtered.map((item) => (
              <div key={item.id} className="stack-item with-action compact">
                <div>
                  <strong>{item.channel?.toUpperCase()} • Territory {item.territory_no}</strong>
                  <p>{item.message}</p>{item.route_target ? <p className="muted-copy">Route: {item.route_target}</p> : null}
                  <p className="muted-copy">{item.locality} • Day {item.threshold} • {formatDateTime(item.created_at)}</p>
                  <p className="muted-copy">Role scope: {item.role_scope || 'All'} • Attempts: {item.attempt_count || 0}{item.provider_message_id ? ` • Provider ID: ${item.provider_message_id}` : ''}</p>
                  <p className="muted-copy">Lifecycle: {item.delivery_state || 'queued'}{item.delivery_state_at ? ` • ${formatDateTime(item.delivery_state_at)}` : ''}</p>
                  {item.last_attempt_at ? <p className="muted-copy">Last attempt: {formatDateTime(item.last_attempt_at)}</p> : null}
                  {item.delivery_detail ? <p className="muted-copy">{item.delivery_detail}</p> : null}
                  {item.failure_reason ? <p className="muted-copy">Failure: {item.failure_reason}</p> : null}
                </div>
                <div className="action-row wrap-actions">
                  <span className="badge neutral">{item.status}</span>
                  {item.status === 'queued' ? <button className="mini-action" type="button" onClick={() => runDispatch([item], 'single')}>Dispatch</button> : null}
                  {item.status === 'failed' ? <button className="mini-action" type="button" onClick={() => runDispatch([item], 'retry-single')}>Retry</button> : null}
                  {item.status !== 'dispatched' ? <button className="mini-action ghost" type="button" onClick={() => mark(item.id, 'dispatched')}>Mark Dispatched</button> : null}
                  {item.status !== 'acknowledged' ? <button className="mini-action ghost" type="button" onClick={() => mark(item.id, 'acknowledged')}>Acknowledge</button> : null}
                  {item.status !== 'failed' ? <button className="mini-action ghost" type="button" onClick={() => mark(item.id, 'failed')}>Mark Failed</button> : null}
                </div>
              </div>
            ))}
            {!filtered.length ? <p className="muted-copy">No notifications found for this filter.</p> : null}
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Notification Analytics</h3>
              <p>Review provider mix, lifecycle distribution, route domains, and the top failure reasons flowing through the queue.</p>
            </div>
          </div>
          <div className="grid-panels">
            <div className="panel-card">
              <h3>Lifecycle Mix</h3>
              <div className="stack-list">
                {analytics.lifecycleCounts.map((item) => (
                  <div key={item.label} className="stack-item compact">
                    <strong>{item.label}</strong>
                    <p>{item.value} notification(s)</p>
                  </div>
                ))}
                {!analytics.lifecycleCounts.length ? <p className="muted-copy">No lifecycle metrics yet.</p> : null}
              </div>
            </div>
            <div className="panel-card">
              <h3>Providers</h3>
              <div className="stack-list">
                {analytics.providerCounts.map((item) => (
                  <div key={item.label} className="stack-item compact">
                    <strong>{item.label}</strong>
                    <p>{item.value} queued/dispatched record(s)</p>
                  </div>
                ))}
                {!analytics.providerCounts.length ? <p className="muted-copy">No provider analytics yet.</p> : null}
              </div>
            </div>
            <div className="panel-card">
              <h3>Route Domains</h3>
              <div className="stack-list">
                {analytics.routeDomainCounts.map((item) => (
                  <div key={item.label} className="stack-item compact">
                    <strong>{item.label}</strong>
                    <p>{item.value} route(s)</p>
                  </div>
                ))}
                {!analytics.routeDomainCounts.length ? <p className="muted-copy">No email or gateway domains in the queue yet.</p> : null}
              </div>
            </div>
            <div className="panel-card">
              <h3>Top Failures</h3>
              <div className="stack-list">
                {analytics.failureCounts.map((item) => (
                  <div key={item.label} className="stack-item compact">
                    <strong>{item.label}</strong>
                    <p>{item.value} failure(s)</p>
                  </div>
                ))}
                {!analytics.failureCounts.length ? <p className="muted-copy">No failures have been recorded.</p> : null}
              </div>
            </div>
          </div>
          <div className="stack-list">
            <h3>Recent Event Types</h3>
            {analytics.eventTypeCounts.map((item) => (
              <div key={item.label} className="stack-item compact">
                <strong>{item.label}</strong>
                <p>{item.value} event(s)</p>
              </div>
            ))}
            {!analytics.eventTypeCounts.length ? <p className="muted-copy">No provider events have been reconciled yet.</p> : null}
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Lifecycle Reconciliation</h3>
              <p>Simulate or reconcile provider callbacks so delivered / opened / bounced states flow back into the queue.</p>
            </div>
            <div className="select-inline action-row">
              <select className="state-select" value={selectedNotificationId} onChange={(event) => setSelectedNotificationId(event.target.value)}>
                <option value="">Select notification</option>
                {notifications.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.channel?.toUpperCase()} • Territory {item.territory_no} • {item.route_target || 'No route'}
                  </option>
                ))}
              </select>
              <button className="mini-action" type="button" disabled={!selectedNotification} onClick={() => triggerLifecycle('delivered')}>Simulate Delivered</button>
              <button className="mini-action ghost" type="button" disabled={!selectedNotification} onClick={() => triggerLifecycle('opened')}>Simulate Opened</button>
              <button className="mini-action ghost" type="button" disabled={!selectedNotification} onClick={() => triggerLifecycle('bounced')}>Simulate Bounced</button>
              <button className="mini-action ghost" type="button" onClick={syncOpenReceipts}>Reconcile Provider Events</button>
            </div>
          </div>
          <div className="grid-panels" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
            <div className="stack-list">
              {events.slice(0, 12).map((event) => (
                <div key={event.id} className="stack-item compact">
                  <strong>{String(event.event_type || 'unknown').toUpperCase()} • {event.provider || 'provider'}</strong>
                  <p>{event.detail || 'Lifecycle event recorded.'}</p>
                  {event.route_target ? <p className="muted-copy">Route: {event.route_target}</p> : null}
                  {event.provider_message_id ? <p className="muted-copy">Provider ID: {event.provider_message_id}</p> : null}
                  <p className="muted-copy">{formatDateTime(event.occurred_at)}</p>
                </div>
              ))}
              {!events.length ? <p className="muted-copy">No lifecycle events recorded yet.</p> : null}
            </div>
            <div className="stack-list">
              <div className="stack-item compact">
                <strong>Selected notification</strong>
                {selectedNotification ? (
                  <>
                    <p>{selectedNotification.channel?.toUpperCase()} • Territory {selectedNotification.territory_no}</p>
                    <p className="muted-copy">Route: {selectedNotification.route_target || 'No route target'}</p>
                    <p className="muted-copy">Lifecycle: {selectedNotification.delivery_state || 'queued'}</p>
                  </>
                ) : <p className="muted-copy">Select a notification to simulate callback events.</p>}
              </div>
              <div className="stack-item compact">
                <strong>Webhook readiness</strong>
                <p>Deploy <code>notification-reconcile</code> and point your provider webhook at that function. The UI here is a safe simulation and audit layer.</p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Dispatch Readiness</h3>
              <p>Make sure at least one matching provider and destination exist before you dispatch.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-item compact">
              <strong>Email targets</strong>
              <p>{targets.filter((item) => item.active && item.channel === 'email').length} active</p>
            </div>
            <div className="stack-item compact">
              <strong>Email-to-text targets</strong>
              <p>{targets.filter((item) => item.active && item.channel === 'email_to_sms').length} active</p>
            </div>
            <div className="stack-item compact">
              <strong>Email providers</strong>
              <p>{providers.filter((item) => item.active && item.channel === 'email').length} active</p>
            </div>
            <div className="stack-item compact">
              <strong>Gateway providers</strong>
              <p>{providers.filter((item) => item.active && item.channel === 'email_to_sms').length} active</p>
            </div>
            <div className="stack-item compact">
              <strong>Run history</strong>
              <p>{runs.length} recorded automation runs available for audit.</p>
            </div>
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Delivery Targets</h3>
              <p>Manage the email and email-to-text endpoints the automation engine will use when dispatch is enabled.</p>
            </div>
            <span className="badge neutral">{targetSource === 'supabase' ? 'Live registry' : 'Local fallback'}</span>
          </div>
          <form className="inline-form stacked-form" onSubmit={saveDeliveryTarget}>
            <input className="state-select" value={targetDraft.label} placeholder="Target label" onChange={(event) => setTargetDraft((current) => ({ ...current, label: event.target.value }))} />
            <select className="state-select" value={targetDraft.channel} onChange={(event) => setTargetDraft((current) => ({ ...current, channel: event.target.value }))}>
              <option value="email">Email</option>
              <option value="email_to_sms">Email-to-text</option>
            </select>
            <input className="state-select" value={targetDraft.destination} placeholder="Destination email or gateway address" onChange={(event) => setTargetDraft((current) => ({ ...current, destination: event.target.value }))} />
            <select className="state-select" value={targetDraft.role_scope} onChange={(event) => setTargetDraft((current) => ({ ...current, role_scope: event.target.value }))}>
              <option value="Admin">Admin</option>
              <option value="Conductor">Conductor</option>
              <option value="Publisher">Publisher</option>
              <option value="All">All</option>
            </select>
            <label className="toggle compact-toggle">
              <input type="checkbox" checked={targetDraft.active} onChange={(event) => setTargetDraft((current) => ({ ...current, active: event.target.checked }))} />
              <span>Active</span>
            </label>
            <button className="mini-action" type="submit">Save Target</button>
          </form>
          <div className="stack-list">
            {targets.map((target) => (
              <div key={target.id} className="stack-item with-action compact">
                <div>
                  <strong>{target.label || 'Untitled target'}</strong>
                  <p>{(target.channel === 'email_to_sms' ? 'EMAIL-TO-TEXT' : target.channel?.toUpperCase())} • {target.destination || 'Destination pending'} • {target.role_scope}</p>
                  <p className="muted-copy">{target.active ? 'Active for dispatch' : 'Inactive'} • {formatDateTime(target.updated_at || target.created_at)}</p>
                </div>
                <div className="action-row">
                  <span className="badge neutral">{target.active ? 'active' : 'inactive'}</span>
                  <button className="mini-action" type="button" onClick={() => toggleTarget(target)}>{target.active ? 'Disable' : 'Enable'}</button>
                  <button className="mini-action ghost" type="button" onClick={() => deleteTarget(target.id)}>Remove</button>
                </div>
              </div>
            ))}
            {!targets.length ? <p className="muted-copy">No delivery targets configured yet.</p> : null}
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Provider Profiles</h3>
              <p>Define non-secret provider metadata. Secrets stay in Supabase Edge Function secrets, not in the frontend.</p>
            </div>
            <span className="badge neutral">{providerSource === 'supabase' ? 'Live providers' : 'Local provider profiles'}</span>
          </div>
          <form className="inline-form stacked-form" onSubmit={saveProviderProfile}>
            <input className="state-select" value={providerDraft.label} placeholder="Provider label" onChange={(event) => setProviderDraft((current) => ({ ...current, label: event.target.value }))} />
            <select className="state-select" value={providerDraft.channel} onChange={(event) => setProviderDraft((current) => ({ ...current, channel: event.target.value }))}>
              <option value="email">Email</option>
              <option value="email_to_sms">Email-to-text</option>
            </select>
            <select className="state-select" value={providerDraft.provider_type} onChange={(event) => setProviderDraft((current) => ({ ...current, provider_type: event.target.value }))}>
              <option value="resend">Resend</option>
              <option value="gmail_smtp">Gmail SMTP</option>
              <option value="manual_stub">Manual Stub</option>
            </select>
            <input className="state-select" value={providerDraft.sender_identity} placeholder="Sender identity (alerts@example.com)" onChange={(event) => setProviderDraft((current) => ({ ...current, sender_identity: event.target.value }))} />
            <label className="toggle compact-toggle">
              <input type="checkbox" checked={providerDraft.active} onChange={(event) => setProviderDraft((current) => ({ ...current, active: event.target.checked }))} />
              <span>Active</span>
            </label>
            <button className="mini-action" type="submit">Save Provider</button>
          </form>
          <div className="stack-list">
            {providers.map((provider) => (
              <div key={provider.id} className="stack-item with-action compact">
                <div>
                  <strong>{provider.label || 'Untitled provider'}</strong>
                  <p>{provider.channel === 'email_to_sms' ? 'EMAIL-TO-TEXT' : provider.channel?.toUpperCase()} • {provider.provider_type} • {provider.sender_identity || 'Sender pending'}</p>
                  <p className="muted-copy">{provider.active ? 'Active for dispatch' : 'Inactive'} • {formatDateTime(provider.updated_at || provider.created_at)}</p>
                </div>
                <div className="action-row">
                  <span className="badge neutral">{provider.active ? 'active' : 'inactive'}</span>
                  <button className="mini-action" type="button" onClick={() => toggleProvider(provider)}>{provider.active ? 'Disable' : 'Enable'}</button>
                  <button className="mini-action ghost" type="button" onClick={() => deleteProvider(provider.id)}>Remove</button>
                </div>
              </div>
            ))}
            {!providers.length ? <p className="muted-copy">No provider profiles configured yet.</p> : null}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Recent Automation Runs</h3>
              <p>Execution history from the automation center.</p>
            </div>
          </div>
          <div className="stack-list">
            {runs.slice(0, 10).map((run) => (
              <div key={run.id} className="stack-item compact">
                <strong>{run.summary.title}</strong>
                <p>{run.summary.detail}</p>
                <p className="muted-copy">{formatDateTime(run.ranAt)} • {run.source}</p>
              </div>
            ))}
            {!runs.length ? <p className="muted-copy">No automation runs recorded yet.</p> : null}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
