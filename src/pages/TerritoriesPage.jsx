import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import PremiumMapCanvas from '../components/PremiumMapCanvas';
import { SearchIcon, SparklesIcon, TerritoriesIcon } from '../components/Icons';
import { useAssignments } from '../hooks/useAssignments';
import { useTerritories } from '../hooks/useTerritories';
import { useAuth } from '../contexts/AuthContext';
import {
  compactAddressMeta,
  progressFromTerritory,
  territoryAvailability,
  territoryLocation,
  toneForAvailability
} from '../utils/presentation';
import {
  canClaimTerritory,
  canCompleteTerritory,
  canReturnTerritory
} from '../utils/assignmentRules';

export default function TerritoriesPage() {
  const { user, profile } = useAuth();
  const { territories, projected, summary } = useTerritories({ enabledOnly: false });
  const { myAssignments, territoryStateFor, claimTerritory, returnTerritory, completeTerritory } = useAssignments(user?.id, profile?.role);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!territories.length) return;
    const preferred = territories.find((territory) => String(territory.territoryNo) === '5') ?? territories[0];
    setSelectedId((current) => current ?? preferred?.id ?? null);
  }, [territories]);

  const filteredTerritories = useMemo(() => {
    const myIds = new Set([...(myAssignments.active || []), ...(myAssignments.completed || [])].map(String));
    return territories.filter((territory) => {
      if (activeTab === 'mine' && !myIds.has(String(territory.id))) return false;
      if (!search.trim()) return true;
      const haystack = `${territory.territoryNo} ${territory.locality || ''} ${territory.city || ''}`.toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [activeTab, myAssignments.active, myAssignments.completed, search, territories]);

  const selectedTerritory = territories.find((territory) => String(territory.id) === String(selectedId)) ?? filteredTerritories[0] ?? territories[0] ?? null;
  const selectedProjected = projected.find((territory) => String(territory.id) === String(selectedId)) ?? projected[0] ?? null;
  const selectedState = selectedTerritory ? territoryStateFor(selectedTerritory.id) : null;
  const availability = territoryAvailability(selectedTerritory, selectedState);
  const progressPercent = progressFromTerritory({ territory: selectedTerritory, assignmentState: selectedState });

  async function handleAction(action) {
    if (!selectedTerritory || !user?.id) return;
    const fn = action === 'claim' ? claimTerritory : action === 'return' ? returnTerritory : completeTerritory;
    const result = await fn(selectedTerritory.id, user.id);
    setMessage(result.ok ? 'Territory updated successfully.' : (result.error?.message || 'Unable to save the assignment change.'));
  }

  return (
    <AppShell
      title="Territories"
      subtitle="A dedicated territory workbench for viewing availability, assignment status, and detailed geofence context."
      metaPills={[
        { label: `${summary.total} Territories`, tone: 'light' },
        { label: `${myAssignments.active?.length || 0} Assigned To Me`, tone: 'dark' }
      ]}
      contentClassName="territories-page-shell"
    >
      <section className="glass-panel territories-top-panel">
        <div className="territories-toolbar">
          <div className="tab-strip" role="tablist" aria-label="Territory views">
            <button type="button" className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>All Territories</button>
            <button type="button" className={activeTab === 'mine' ? 'active' : ''} onClick={() => setActiveTab('mine')}>My Assignments</button>
          </div>

          <label className="search-field">
            <SearchIcon />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search territories or localities" />
          </label>
        </div>

        <div className="territories-grid">
          <div className="territories-table-panel">
            <div className="table-shell">
              <table className="territory-table">
                <thead>
                  <tr>
                    <th>Territory No</th>
                    <th>Locality</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTerritories.length ? filteredTerritories.map((territory) => {
                    const state = territoryStateFor(territory.id);
                    const rowAvailability = territoryAvailability(territory, state);
                    const rowCanClaim = canClaimTerritory(state, user?.id);
                    const rowCanReturn = canReturnTerritory(state, user?.id, profile?.role);
                    const rowCanComplete = canCompleteTerritory(state, user?.id, profile?.role);
                    return (
                      <tr key={territory.id} className={selectedId === territory.id ? 'selected' : ''} onClick={() => setSelectedId(territory.id)}>
                        <td>
                          <strong>Territory {territory.territoryNo}</strong>
                          <small>{territory.addresses?.length ?? 0} addresses</small>
                        </td>
                        <td>{territory.locality || territory.city || 'Unknown locality'}</td>
                        <td>
                          <div className="territory-status-stack">
                            <span className={`status-pill ${toneForAvailability(rowAvailability)}`}>{rowAvailability}</span>
                            <span className="subtle-text">{territory.territory_state || 'Initial Call'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-action-row">
                            <button type="button" className="table-action" disabled={!rowCanClaim} onClick={(event) => { event.stopPropagation(); setSelectedId(territory.id); handleAction('claim'); }}>Claim</button>
                            <button type="button" className="table-action ghost" disabled={!rowCanReturn} onClick={(event) => { event.stopPropagation(); setSelectedId(territory.id); handleAction('return'); }}>Return</button>
                            <button type="button" className="table-action ghost" disabled={!rowCanComplete} onClick={(event) => { event.stopPropagation(); setSelectedId(territory.id); handleAction('complete'); }}>Complete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="4">
                        <div className="empty-inline-card">
                          <TerritoriesIcon />
                          <p>No territories matched this view.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="territory-detail-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow-label">Territory Detail</span>
                <h2>{selectedTerritory ? `Territory ${selectedTerritory.territoryNo}` : 'Select a Territory'}</h2>
                <p>{territoryLocation(selectedTerritory)}</p>
              </div>
              <span className={`status-pill ${toneForAvailability(availability)}`}>{availability}</span>
            </div>

            <div className="territory-detail-map">
              <PremiumMapCanvas
                territories={territories}
                projected={projected}
                selectedId={selectedId}
                onSelect={setSelectedId}
                focusOnly={Boolean(selectedProjected)}
                dimOthers={false}
                zoomLevel={1.18}
              />
            </div>

            <div className="territory-detail-stats">
              <div className="metric-card">
                <span>Addresses</span>
                <strong>{selectedTerritory?.addresses?.length ?? 0}</strong>
              </div>
              <div className="metric-card">
                <span>Progress</span>
                <strong>{progressPercent}%</strong>
              </div>
            </div>

            <div className="progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="territory-detail-actions">
              <button type="button" className="primary-action" disabled={!canClaimTerritory(selectedState, user?.id)} onClick={() => handleAction('claim')}>Claim Territory</button>
              <button type="button" className="secondary-action" disabled={!canReturnTerritory(selectedState, user?.id, profile?.role)} onClick={() => handleAction('return')}>Return Territory</button>
              <button type="button" className="secondary-action" disabled={!canCompleteTerritory(selectedState, user?.id, profile?.role)} onClick={() => handleAction('complete')}>Mark Complete</button>
            </div>

            <div className="territory-detail-list">
              {(selectedTerritory?.addresses || []).slice(0, 6).map((address) => (
                <article key={address.full} className="territory-list-card">
                  <div>
                    <strong>{address.full.split(',')[0]}</strong>
                    <p>{compactAddressMeta(address.full)}</p>
                  </div>
                  <span className="status-pill mini muted">{selectedTerritory?.territory_state || 'Initial Call'}</span>
                </article>
              ))}

              {!selectedTerritory?.addresses?.length ? (
                <div className="empty-inline-card">
                  <SparklesIcon />
                  <p>This territory does not have address inventory loaded yet.</p>
                </div>
              ) : null}
            </div>

            {message ? <p className="inline-message">{message}</p> : null}
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
