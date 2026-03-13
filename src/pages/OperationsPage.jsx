import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import { useOperationalSettings } from '../hooks/useOperationalSettings';
import { useTerritories } from '../hooks/useTerritories';
import { useAssignments } from '../hooks/useAssignments';
import { evaluateAutomationState } from '../utils/automationEngine';
import { useAutomationCenter } from '../hooks/useAutomationCenter';

const CHANNELS = ['in_app', 'email', 'email_to_sms'];

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle compact-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

export default function OperationsPage() {
  const { settings, save, source, serviceWindowState } = useOperationalSettings();
  const { territories, source: territorySource } = useTerritories();
  const { history, source: assignmentSource } = useAssignments(null, 'Admin');
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const alertSummary = useMemo(() => {
    return [form.expirationAlertDay1, form.expirationAlertDay2, form.expirationAlertDay3].filter(Boolean).join(' • ');
  }, [form]);

  const automationState = useMemo(() => evaluateAutomationState({ territories, history, settings: form }), [territories, history, form]);
  const { runs, source: automationSource, busy: automationBusy, executeRun } = useAutomationCenter({
    state: automationState,
    settings: form,
    sourceTag: `${source}/${territorySource}/${assignmentSource}`
  });

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleChannel(channel) {
    setForm((current) => {
      const next = new Set(current.expirationChannels || []);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return { ...current, expirationChannels: [...next] };
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    const result = await save(form);
    setMessage(result.ok ? 'Operational settings saved.' : 'Saved locally. Supabase update was unavailable.');
  }

  async function handleRun(kind) {
    const result = await executeRun(kind);
    setMessage(result.deliveryDetail || result.summary.detail);
  }

  return (
    <AppShell title="Automation & Service Windows" subtitle="Control operational windows, execution-ready alerts, and Circuit Overseer scheduling from one place.">
      <div className="kpi-grid">
        <KpiCard label="Telephone Window" value={serviceWindowState.telephone ? 'Open' : 'Closed'} helper={`${form.telephoneWindowStart}–${form.telephoneWindowEnd}`} />
        <KpiCard label="Letter Window" value={serviceWindowState.letter ? 'Open' : 'Closed'} helper={`${form.letterWritingWindowStart}–${form.letterWritingWindowEnd}`} />
        <KpiCard label="Due Alerts" value={automationState.dueAlerts.length} helper={`${automationState.notificationQueue.length} notifications ready`} />
        <KpiCard label="Enrichment Due" value={automationState.enrichmentDue.length} helper={`Territories ${territorySource === 'supabase' ? 'live' : 'fallback'}`} />
      </div>

      {message ? <p className="muted-copy">{message}</p> : null}

      <div className="grid-panels admin-layout">
        <form className="panel-card wide" onSubmit={handleSave}>
          <div className="panel-card-header">
            <div>
              <h3>Service Windows</h3>
              <p>These windows are enforced in the Publisher workflow and surfaced throughout the app shell.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="two-col select-inline export-form-grid">
              <label><span>Telephone start</span><input type="time" value={form.telephoneWindowStart || ''} onChange={(event) => updateField('telephoneWindowStart', event.target.value)} /></label>
              <label><span>Telephone end</span><input type="time" value={form.telephoneWindowEnd || ''} onChange={(event) => updateField('telephoneWindowEnd', event.target.value)} /></label>
              <label><span>Letter start</span><input type="time" value={form.letterWritingWindowStart || ''} onChange={(event) => updateField('letterWritingWindowStart', event.target.value)} /></label>
              <label><span>Letter end</span><input type="time" value={form.letterWritingWindowEnd || ''} onChange={(event) => updateField('letterWritingWindowEnd', event.target.value)} /></label>
            </div>
            <div className="action-row">
              <Toggle label="Telephone witnessing enabled" checked={Boolean(form.telephoneWitnessingEnabled)} onChange={(value) => updateField('telephoneWitnessingEnabled', value)} />
              <Toggle label="Letter writing enabled" checked={Boolean(form.letterWritingEnabled)} onChange={(value) => updateField('letterWritingEnabled', value)} />
            </div>
          </div>

          <div className="panel-card-header top-gap">
            <div>
              <h3>Expiration Alerts</h3>
              <p>These thresholds drive conductor notifications and automation sweeps.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="two-col select-inline export-form-grid">
              <label><span>Alert day 1</span><input type="number" min="1" value={form.expirationAlertDay1 ?? ''} onChange={(event) => updateField('expirationAlertDay1', Number(event.target.value))} /></label>
              <label><span>Alert day 2</span><input type="number" min="1" value={form.expirationAlertDay2 ?? ''} onChange={(event) => updateField('expirationAlertDay2', Number(event.target.value))} /></label>
              <label><span>Alert day 3</span><input type="number" min="1" value={form.expirationAlertDay3 ?? ''} onChange={(event) => updateField('expirationAlertDay3', Number(event.target.value))} /></label>
              <label><span>Automation notes</span><input value={form.automationNotes || ''} onChange={(event) => updateField('automationNotes', event.target.value)} placeholder="Email conductors at 113, 119, and 120 days." /></label>
            </div>
            <div className="action-row">
              {CHANNELS.map((channel) => (
                <Toggle key={channel} label={`Send via ${channel === 'email_to_sms' ? 'EMAIL-TO-TEXT' : channel.toUpperCase()}`} checked={(form.expirationChannels || []).includes(channel)} onChange={() => toggleChannel(channel)} />
              ))}
            </div>
            <div className="action-row">
              <Toggle label="Enable email-to-text fallback" checked={Boolean(form.emailToTextFallbackEnabled)} onChange={(value) => updateField('emailToTextFallbackEnabled', value)} />
              <Toggle label="Auto-disable failing gateways" checked={Boolean(form.disableFailingGateways)} onChange={(value) => updateField('disableFailingGateways', value)} />
            </div>
            <p className="muted-copy">Carrier email-to-text is best-effort only. Keep email + in-app enabled as the primary channels.</p>
          </div>

          <div className="panel-card-header top-gap">
            <div>
              <h3>Circuit Overseer Visit Controls</h3>
              <p>Schedule a CO visit window so the dashboard can adjust service access messaging and initial-call defaults automatically.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="two-col select-inline export-form-grid">
              <label><span>CO visit start</span><input type="datetime-local" value={form.coVisitStart || ''} onChange={(event) => updateField('coVisitStart', event.target.value)} /></label>
              <label><span>CO visit end</span><input type="datetime-local" value={form.coVisitEnd || ''} onChange={(event) => updateField('coVisitEnd', event.target.value)} /></label>
            </div>
            <div className="action-row">
              <Toggle label="Enable CO visit mode" checked={Boolean(form.coVisitModeEnabled)} onChange={(value) => updateField('coVisitModeEnabled', value)} />
              <Toggle label="Restrict telephone witnessing during visit" checked={Boolean(form.coRestrictTelephone)} onChange={(value) => updateField('coRestrictTelephone', value)} />
              <Toggle label="Force enabled territories to Initial Call" checked={Boolean(form.coForceInitialCalls)} onChange={(value) => updateField('coForceInitialCalls', value)} />
            </div>
            <div className="stack-item compact">
              <strong>Preview</strong>
              <p>{automationState.coVisitSummary}</p>
            </div>
            <div className="action-row">
              <button className="shell-signout form-submit" type="submit">Save Operational Controls</button>
            </div>
          </div>
        </form>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Execution Center</h3>
              <p>Run the same sweeps your future background jobs will use and inspect what would be sent right now.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="action-row wrap-actions">
              <button className="shell-signout form-submit" type="button" disabled={automationBusy} onClick={() => handleRun('full')}>Run Full Sweep</button>
              <button className="mini-action" type="button" onClick={() => handleRun('expiration')}>Run Expiration Sweep</button>
              <button className="mini-action" type="button" onClick={() => handleRun('enrichment')}>Run Enrichment Audit</button>
              <button className="mini-action" type="button" onClick={() => handleRun('co-sync')}>Run CO Sync</button>
            </div>
            <div className="stack-item compact">
              <strong>Readiness</strong>
              <p>{automationState.executionReady ? 'Automation controls are configured and ready for backend scheduling.' : 'Complete your operational settings before enabling live backend scheduling.'}</p>
            </div>
            <div className="stack-item compact">
              <strong>Data sources</strong>
              <p>Settings: {source} • Territories: {territorySource} • Ledger: {assignmentSource} • Runs: {automationSource}</p>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Expiration Queue</h3>
              <p>Territories currently due or approaching your configured thresholds.</p>
            </div>
          </div>
          <div className="stack-list">
            {automationState.dueAlerts.slice(0, 8).map((item) => (
              <div key={item.territoryId} className="stack-item compact">
                <strong>Territory {item.territoryNo}</strong>
                <p>{item.locality} • {item.daysInPool} days in pool • Crossed {item.reachedThresholds.join(', ')} days</p>
              </div>
            ))}
            {!automationState.dueAlerts.length ? <p className="muted-copy">No territories are currently past the configured alert thresholds.</p> : null}
            {automationState.dueSoon.slice(0, 6).map((item) => (
              <div key={`soon-${item.territoryId}`} className="stack-item compact subdued-card">
                <strong>Watch Territory {item.territoryNo}</strong>
                <p>{item.locality} • {item.daysInPool} days in pool • Next alert at day {item.nextThreshold}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Notification Queue</h3>
              <p>These are the messages the backend alert runner would prepare right now.</p>
            </div>
          </div>
          <div className="stack-list">
            {automationState.notificationQueue.slice(0, 12).map((item) => (
              <div key={item.id} className="stack-item compact with-action">
                <div>
                  <strong>{item.channel.toUpperCase()} • Territory {item.territoryNo}</strong>
                  <p>{item.message}</p>
                </div>
                <span className="badge neutral">Day {item.threshold}</span>
              </div>
            ))}
            {!automationState.notificationQueue.length ? <p className="muted-copy">No notifications are currently queued.</p> : null}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Semi-Annual Enrichment</h3>
              <p>Audit territories that are due for the Playwright enrichment pipeline.</p>
            </div>
          </div>
          <div className="stack-list">
            {automationState.enrichmentDue.slice(0, 8).map((item) => (
              <div key={item.territoryId} className="stack-item compact">
                <strong>Territory {item.territoryNo}</strong>
                <p>{item.locality} • Last fetched {formatDateTime(item.lastFetchedAt)} • Overdue by {item.overdueDays} days</p>
              </div>
            ))}
            {!automationState.enrichmentDue.length ? <p className="muted-copy">No territories are currently due for semi-annual enrichment.</p> : null}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Execution History</h3>
              <p>Recent manual runs saved locally until your secure backend scheduler is attached.</p>
            </div>
          </div>
          <div className="stack-list">
            {runs.slice(0, 8).map((run) => (
              <div key={run.id} className="stack-item compact">
                <strong>{run.summary.title}</strong>
                <p>{run.summary.detail}</p>
                <p className="muted-copy">{formatDateTime(run.ranAt)} • {run.source}</p>
              </div>
            ))}
            {!runs.length ? <p className="muted-copy">No automation sweeps have been run yet.</p> : null}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
