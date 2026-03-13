import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import PremiumMapCanvas from '../components/PremiumMapCanvas';
import {
  AtlasIcon,
  CalendarIcon,
  SparklesIcon,
  TerritoriesIcon
} from '../components/Icons';
import { useAddressLogs } from '../hooks/useAddressLogs';
import { useAssignments } from '../hooks/useAssignments';
import { useCampaignData } from '../hooks/useCampaignData';
import { useOperationalSettings } from '../hooks/useOperationalSettings';
import { useTerritories } from '../hooks/useTerritories';
import { useAuth } from '../contexts/AuthContext';
import {
  badgeLabelForStatusCode,
  compactAddressMeta,
  progressFromTerritory,
  territoryAvailability,
  territoryLocation,
  toneForAvailability,
  toneForStatusCode
} from '../utils/presentation';
import {
  canClaimTerritory,
  canCompleteTerritory,
  canReturnTerritory
} from '../utils/assignmentRules';

const STATUS_CODES = ['CM', 'NA', 'NIS', 'VM', 'DNC', 'NN', 'MVD', 'BUS', 'OL'];
const LANGUAGE_OPTIONS = ['Spanish', 'French', 'Haitian Creole', 'Mandarin', 'Arabic', 'Other'];

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { territories, projected, summary, source } = useTerritories({ enabledOnly: false });
  const { campaigns } = useCampaignData({ userId: user?.id, role: profile?.role });
  const { history, territoryStateFor, claimTerritory, returnTerritory, completeTerritory } = useAssignments(user?.id, profile?.role);
  const { settings, serviceWindowState } = useOperationalSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [statusCode, setStatusCode] = useState('CM');
  const [secondaryLanguage, setSecondaryLanguage] = useState('Spanish');
  const [message, setMessage] = useState('');
  const [submitState, setSubmitState] = useState('idle');

  useEffect(() => {
    if (!territories.length) return;
    const requestedId = searchParams.get('territory');
    const requested = territories.find((territory) => String(territory.id) === requestedId || String(territory.territoryNo) === requestedId);
    const preferred = requested ?? territories.find((territory) => String(territory.territoryNo) === '5') ?? territories.find((territory) => territory.is_enabled) ?? territories[0];
    setSelectedId((current) => current ?? preferred?.id ?? null);
  }, [searchParams, territories]);

  const selectedTerritory = territories.find((territory) => String(territory.id) === String(selectedId)) ?? territories[0] ?? null;
  const selectedProjected = projected.find((territory) => String(territory.id) === String(selectedId)) ?? projected[0] ?? null;
  const selectedState = selectedTerritory ? territoryStateFor(selectedTerritory.id) : null;
  const { logs, latestByAddress, createLog, summary: logSummary } = useAddressLogs(selectedId);
  const activeCampaignCount = campaigns.filter((campaign) => campaign.is_active).length;
  const completedCount = territories.filter((territory) => territoryStateFor(territory.id)?.isCompleted).length;
  const inProgressCount = territories.filter((territory) => territoryStateFor(territory.id)?.isSelected).length;
  const availability = territoryAvailability(selectedTerritory, selectedState);
  const progressPercent = progressFromTerritory({ territory: selectedTerritory, assignmentState: selectedState, logCount: logs.length });
  const addresses = selectedTerritory?.addresses ?? [];
  const recentHistory = history.slice(0, 5);
  const serviceWindowOpen = statusCode === 'OL' ? serviceWindowState.letter : serviceWindowState.telephone;
  const canClaim = selectedTerritory && canClaimTerritory(selectedState, user?.id);
  const canReturn = selectedTerritory && canReturnTerritory(selectedState, user?.id, profile?.role);
  const canComplete = selectedTerritory && canCompleteTerritory(selectedState, user?.id, profile?.role);

  useEffect(() => {
    if (!selectedTerritory) return;
    const requestedAddress = searchParams.get('address');
    const match = addresses.find((address) => address.full === requestedAddress);
    setSelectedAddress((current) => current || match?.full || addresses[0]?.full || '');
  }, [addresses, searchParams, selectedTerritory]);

  async function handleAssignment(action) {
    if (!selectedTerritory || !user?.id) return;
    const fn = action === 'claim' ? claimTerritory : action === 'return' ? returnTerritory : completeTerritory;
    const result = await fn(selectedTerritory.id, user.id);
    setMessage(result.ok ? 'Assignment state updated.' : (result.error?.message || 'Unable to update assignment state right now.'));
  }

  async function handleLogSubmit(event) {
    event.preventDefault();
    if (!selectedAddress || !serviceWindowOpen) return;
    setSubmitState('saving');
    const result = await createLog({
      address: selectedAddress,
      status_code: statusCode,
      secondary_language: statusCode === 'OL' ? secondaryLanguage : null
    });
    setSubmitState(result.ok ? 'saved' : 'fallback');
    setMessage(result.ok ? 'Address disposition logged.' : 'Saved locally because the database write was unavailable.');
  }

  function selectTerritory(nextId) {
    setSelectedId(nextId);
    const nextTerritory = territories.find((territory) => String(territory.id) === String(nextId));
    const nextAddress = nextTerritory?.addresses?.[0]?.full || '';
    setSelectedAddress(nextAddress);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('territory', String(nextId));
      if (nextAddress) params.set('address', nextAddress);
      return params;
    });
  }

  return (
    <AppShell
      title="Home Dashboard"
      subtitle="A live operational board for assignments, address work, and territory status from the enabled pool."
      metaPills={[
        { label: selectedTerritory?.locality || 'Enabled Pool', tone: 'light' },
        { label: `${summary.enabled} Enabled`, tone: 'dark' }
      ]}
      contentClassName="dashboard-page-shell"
    >
      <div className="kpi-grid">
        <KpiCard label="Enabled Pool" value={summary.enabled} helper={source === 'supabase' ? 'Live from Supabase' : 'Master fallback'} icon={<TerritoriesIcon />} />
        <KpiCard label="Completed" value={completedCount} helper="Assignment ledger" accent="blue" icon={<CalendarIcon />} />
        <KpiCard label="In Progress" value={inProgressCount} helper="Selected territories" accent="teal" icon={<SparklesIcon />} />
        <KpiCard label="Active Campaigns" value={activeCampaignCount} helper={`${summary.total} total territories`} accent="slate" icon={<AtlasIcon />} />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel dashboard-map-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow-label">Master Map</span>
              <h2>{selectedTerritory ? `Territory ${selectedTerritory.territoryNo}` : 'Territory Atlas'}</h2>
              <p>{territoryLocation(selectedTerritory)}</p>
            </div>
            <div className="dashboard-map-meta">
              <span className={`status-pill ${toneForAvailability(availability)}`}>{availability}</span>
              <span className="subtle-pill">{selectedTerritory?.territory_state || 'Initial Call'}</span>
            </div>
          </div>

          <div className="dashboard-map-frame">
            <PremiumMapCanvas territories={territories} projected={projected} selectedId={selectedId} onSelect={selectTerritory} zoomLevel={1.08} />
          </div>

          <div className="dashboard-map-footer">
            <div className="map-footer-meta">
              <strong>Focused Territory</strong>
              <span>{selectedProjected?.streetLabels?.join(' • ') || 'Street labels will appear as address enrichment grows.'}</span>
            </div>
            <div className="map-footer-progress">
              <span>Progress</span>
              <div className="progress-track">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          </div>
        </section>

        <aside className="glass-panel workflow-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow-label">Active Workflow</span>
              <h2>{selectedTerritory ? `Territory ${selectedTerritory.territoryNo}` : 'Select Territory'}</h2>
              <p>{selectedTerritory ? `${selectedTerritory.addresses?.length ?? 0} addresses ready for disposition logging.` : 'Choose a territory to begin.'}</p>
            </div>
          </div>

          <div className="workflow-action-row">
            <button type="button" className="primary-action" disabled={!canClaim} onClick={() => handleAssignment('claim')}>Claim</button>
            <button type="button" className="secondary-action" disabled={!canReturn} onClick={() => handleAssignment('return')}>Return</button>
            <button type="button" className="secondary-action" disabled={!canComplete} onClick={() => handleAssignment('complete')}>Complete</button>
          </div>

          <form className="workflow-form" onSubmit={handleLogSubmit}>
            <label>
              <span>Territory</span>
              <select value={selectedId || ''} onChange={(event) => selectTerritory(event.target.value)}>
                {territories.map((territory) => (
                  <option key={territory.id} value={territory.id}>
                    Territory {territory.territoryNo} • {territory.locality || territory.city || 'Locality pending'}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Address</span>
              <select value={selectedAddress} onChange={(event) => setSelectedAddress(event.target.value)} required>
                <option value="">Select address</option>
                {addresses.map((address) => (
                  <option key={address.full} value={address.full}>
                    {address.full}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Status Code</span>
              <select value={statusCode} onChange={(event) => setStatusCode(event.target.value)}>
                {STATUS_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} • {badgeLabelForStatusCode(code)}
                  </option>
                ))}
              </select>
            </label>

            {statusCode === 'OL' ? (
              <label>
                <span>Secondary Language</span>
                <select value={secondaryLanguage} onChange={(event) => setSecondaryLanguage(event.target.value)}>
                  {LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="workflow-window-card">
              <strong>Service Window</strong>
              <p>
                {statusCode === 'OL'
                  ? `Letter writing ${serviceWindowState.letter ? 'open' : 'closed'} • ${settings.letterWritingWindowStart}-${settings.letterWritingWindowEnd}`
                  : `Telephone witnessing ${serviceWindowState.telephone ? 'open' : 'closed'} • ${settings.telephoneWindowStart}-${settings.telephoneWindowEnd}`}
              </p>
            </div>

            <button type="submit" className="primary-action wide" disabled={!selectedAddress || !serviceWindowOpen}>
              {submitState === 'saving' ? 'Saving...' : 'Log Address Status'}
            </button>
          </form>

          <div className="workflow-summary-grid">
            <div className="workflow-summary-card">
              <span>Logs</span>
              <strong>{logSummary.total}</strong>
            </div>
            <div className="workflow-summary-card">
              <span>DNC Flags</span>
              <strong>{logSummary.dnc}</strong>
            </div>
          </div>

          <div className="workflow-address-list">
            {addresses.slice(0, 5).map((address) => {
              const latest = latestByAddress.get(address.full);
              return (
                <button
                  key={address.full}
                  type="button"
                  className={`workflow-address-card${selectedAddress === address.full ? ' active' : ''}`}
                  onClick={() => setSelectedAddress(address.full)}
                >
                  <div>
                    <strong>{address.full.split(',')[0]}</strong>
                    <p>{compactAddressMeta(address.full)}</p>
                  </div>
                  <span className={`status-pill mini ${toneForStatusCode(latest?.status_code)}`}>
                    {latest ? badgeLabelForStatusCode(latest.status_code) : 'Queued'}
                  </span>
                </button>
              );
            })}
          </div>

          {message ? <p className="inline-message">{message}</p> : null}
          {!serviceWindowOpen ? <p className="inline-warning">This disposition is outside the configured service window.</p> : null}
          {submitState === 'saved' ? <p className="inline-success">Supabase log saved successfully.</p> : null}
        </aside>
      </div>

      <section className="glass-panel recent-activity-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow-label">Recent Activity</span>
            <h2>Assignment Timeline</h2>
            <p>The latest publisher assignment events flowing through the territory ledger.</p>
          </div>
        </div>
        <div className="activity-list">
          {recentHistory.length ? recentHistory.map((entry) => (
            <article key={entry.id} className="activity-card">
              <strong>{entry.action}</strong>
              <p>Territory {territories.find((territory) => territory.id === entry.territory_id)?.territoryNo || entry.territory_id}</p>
              <small>{new Date(entry.action_date).toLocaleString()}</small>
            </article>
          )) : (
            <div className="empty-inline-card">
              <SparklesIcon />
              <p>Assignment activity will appear here as the workflow starts moving.</p>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
