import { useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import TerritoryMapPanel from '../components/TerritoryMapPanel';
import { useCampaignData } from '../hooks/useCampaignData';
import { projectTerritories } from '../utils/territoryMap';
import { useAuth } from '../contexts/AuthContext';
import { canCompleteTerritory, canUnmarkCompletion } from '../utils/assignmentRules';

export default function CampaignsPage() {
  const { profile, user } = useAuth();
  const { campaigns, territories, history, kpis, loading, error, source, busy, completionMap, recordAction, createCampaign, toggleCampaignActive } = useCampaignData({ userId: user?.id, role: profile?.role });
  const [selectedId, setSelectedId] = useState(territories[0]?.id ?? null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    defaultEnabledToInitialCalls: true
  });
  const [message, setMessage] = useState('');

  const projected = useMemo(() => projectTerritories(territories), [territories]);
  const highlightedId = selectedId ?? territories[0]?.id ?? null;
  const selectedTerritory = territories.find((territory) => territory.id === highlightedId) ?? null;
  const selectedCompletion = selectedTerritory ? completionMap.get(selectedTerritory.id) : null;
  const canComplete = canCompleteTerritory(selectedCompletion, user?.id, profile?.role);
  const canUnmark = canUnmarkCompletion(selectedCompletion, user?.id, profile?.role);

  async function handleAction(action) {
    if (!selectedTerritory || !user?.id) return;
    const result = await recordAction(selectedTerritory.id, user.id, action);
    setMessage(result.ok ? `Territory ${selectedTerritory.territoryNo} marked ${action}.` : `Unable to record ${action}: ${result.error.message}`);
  }

  async function handleCampaignSubmit(event) {
    event.preventDefault();
    const result = await createCampaign(campaignForm, { defaultEnabledToInitialCalls: campaignForm.defaultEnabledToInitialCalls });
    setMessage(result.ok ? 'Campaign created successfully.' : `Unable to create campaign: ${result.error.message}`);
    if (result.ok) {
      setCampaignForm((current) => ({ ...current, name: '', end_date: '' }));
    }
  }

  async function handleToggleCampaign(campaign) {
    const result = await toggleCampaignActive(campaign.id, !campaign.is_active);
    setMessage(result.ok ? `Campaign ${campaign.is_active ? 'paused' : 'activated'}.` : `Unable to update campaign: ${result.error.message}`);
  }

  return (
    <AppShell title="Campaigns" subtitle="Track active drives, completion velocity, and current campaign coverage.">
      <div className="kpi-grid">
        <KpiCard label="Total Territories" value={kpis.total} />
        <KpiCard label="Completed" value={kpis.completed} />
        <KpiCard label="Remaining" value={kpis.remaining} />
        <KpiCard label="Progress" value={`${kpis.progress}%`} helper={`${kpis.enabled} enabled right now • ${source === 'supabase' ? 'Live' : 'Fallback'}`} />
      </div>

      {message ? <p className="muted-copy">{message}</p> : null}

      <div className="grid-panels dashboard-layout">
        <TerritoryMapPanel entries={projected} highlightedId={highlightedId} title="Campaign Territory Coverage" subtitle="Completed or recently touched territories can be emphasized during active drives." />

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Active Campaigns</h3>
              <p>Campaign launches and current visibility.</p>
            </div>
          </div>
          <div className="stack-list">
            {campaigns.length ? campaigns.map((campaign) => (
              <div key={campaign.id} className="stack-item compact with-action">
                <div>
                  <strong>{campaign.name}</strong>
                  <p>{campaign.is_active ? 'Active' : 'Inactive'} • {campaign.start_date}{campaign.end_date ? ` → ${campaign.end_date}` : ''}</p>
                </div>
                <button className="mini-action" type="button" onClick={() => handleToggleCampaign(campaign)}>{campaign.is_active ? 'Pause' : 'Activate'}</button>
              </div>
            )) : <p className="muted-copy">No campaigns loaded yet.</p>}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Completion Control</h3>
              <p>Conductors can complete territories and only unmark their own completions unless an Admin intervenes.</p>
            </div>
          </div>
          {selectedTerritory ? (
            <div className="stack-list">
              <div className="stack-item compact with-action">
                <div>
                  <strong>Territory {selectedTerritory.territoryNo}</strong>
                  <p>{selectedTerritory.locality ?? selectedTerritory.city ?? 'No locality'} • {selectedCompletion?.isCompleted ? 'Completed' : 'Open'}</p>
                </div>
                <button className="mini-action" type="button" onClick={() => setSelectedId(selectedTerritory.id)}>Selected</button>
              </div>
              <div className="action-row">
                <button className="shell-signout form-submit" type="button" disabled={!canComplete} onClick={() => handleAction('Completed')}>Mark Complete</button>
                <button className="mini-action ghost" type="button" disabled={!canUnmark} onClick={() => handleAction('Returned')}>Unmark / Return</button>
              </div>
              <ul className="rules-list">
                <li>Approved Conductors can mark territories complete.</li>
                <li>Only the same Conductor can unmark a completion they recorded, unless an Admin overrides it.</li>
                <li>Campaign start workflows can default enabled territories to Initial Call.</li>
              </ul>
            </div>
          ) : <p className="muted-copy">Choose a territory to manage completion status.</p>}
          {loading ? <p className="muted-copy">Loading campaign telemetry…</p> : null}
          {error ? <p className="error-copy">Campaign telemetry unavailable: {error.message}</p> : null}
        </article>

        <article className="panel-card">
          <div className="panel-card-header"><div><h3>Launch Campaign</h3><p>Create a campaign directly from the campaigns workspace.</p></div></div>
          <form className="address-log-form" onSubmit={handleCampaignSubmit}>
            <label><span>Campaign name</span><input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} placeholder="Special Talk Campaign" required /></label>
            <label><span>Start date</span><input type="date" value={campaignForm.start_date} onChange={(event) => setCampaignForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
            <label><span>End date</span><input type="date" value={campaignForm.end_date} onChange={(event) => setCampaignForm((current) => ({ ...current, end_date: event.target.value }))} /></label>
            <label className="toggle compact-toggle"><input type="checkbox" checked={campaignForm.defaultEnabledToInitialCalls} onChange={(event) => setCampaignForm((current) => ({ ...current, defaultEnabledToInitialCalls: event.target.checked }))} /><span>Default enabled territories to Initial Call</span></label>
            <button className="shell-signout form-submit" type="submit" disabled={busy || !campaignForm.name.trim()}>{busy ? 'Creating…' : 'Create Campaign'}</button>
          </form>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header"><div><h3>Territory Campaign Queue</h3><p>Select a territory to spotlight it on the map and manage its completion state.</p></div></div>
          <div className="territory-card-list two-col">
            {territories.map((territory) => {
              const state = completionMap.get(territory.id);
              return (
                <button key={territory.id} type="button" className={`territory-select-card${territory.id === highlightedId ? ' active' : ''}`} onClick={() => setSelectedId(territory.id)}>
                  <div>
                    <h4>Territory {territory.territoryNo ?? territory.id}</h4>
                    <p>{territory.locality ?? territory.city ?? 'Campaign territory'} • {state?.isCompleted ? 'Completed' : 'Open'}</p>
                  </div>
                  <span className={`badge ${state?.isCompleted ? 'letter' : 'neutral'}`}>{state?.isCompleted ? 'Completed' : 'Open'}</span>
                </button>
              );
            })}
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header"><div><h3>Assignment Timeline</h3><p>Recent territory actions from the assignment history ledger.</p></div></div>
          <div className="stack-list">
            {history.slice(0, 12).map((row) => (
              <div key={row.id} className="stack-item compact">
                <strong>{row.action}</strong>
                <p>Territory {territories.find((territory) => territory.id === row.territory_id)?.territoryNo ?? row.territory_id} • {new Date(row.action_date).toLocaleString()}</p>
              </div>
            ))}
            {!history.length ? <p className="muted-copy">No assignment history yet.</p> : null}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
