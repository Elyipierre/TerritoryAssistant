import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import PremiumMapCanvas from '../components/PremiumMapCanvas';
import { DrawIcon, LocateIcon, MapPinIcon, MinusIcon, PlusIcon, SparklesIcon } from '../components/Icons';
import { useAddressLogs } from '../hooks/useAddressLogs';
import { useWorkspaceSnapshot } from '../hooks/useWorkspaceSnapshot';
import {
  badgeLabelForStatusCode,
  compactAddressMeta,
  derivePersonName,
  progressFromTerritory,
  territoryAvailability,
  territoryLocation,
  toneForAvailability
} from '../utils/presentation';

function AtlasControl({ onClick, icon, label, active = false }) {
  return (
    <button type="button" className={`atlas-map-control${active ? ' active' : ''}`} onClick={onClick} aria-label={label} title={label}>
      {icon}
    </button>
  );
}

function statusPill(latestStatus, index) {
  if (latestStatus) return badgeLabelForStatusCode(latestStatus.status_code);
  return index === 0 ? 'Open' : index === 1 ? 'Ready' : 'Review';
}

export default function AtlasPage() {
  const navigate = useNavigate();
  const { territories, projected, users, ledger, metrics, loading, source, error } = useWorkspaceSnapshot();
  const [selectedId, setSelectedId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [drawMode, setDrawMode] = useState(false);
  const { latestByAddress } = useAddressLogs(selectedId);

  useEffect(() => {
    if (!territories.length) return;
    const preferred = territories.find((territory) => String(territory.territoryNo) === '5') ?? territories.find((territory) => territory.is_enabled) ?? territories[0];
    setSelectedId((current) => current ?? preferred?.id ?? null);
  }, [territories]);

  const selectedTerritory = territories.find((territory) => String(territory.id) === String(selectedId)) ?? territories[0] ?? null;
  const selectedProjected = projected.find((territory) => String(territory.id) === String(selectedId)) ?? projected[0] ?? null;
  const assignmentState = selectedTerritory ? ledger.territoryMap.get(selectedTerritory.id) : null;
  const availability = territoryAvailability(selectedTerritory, assignmentState);
  const activeUser = users.find((entry) => entry.user_id === (assignmentState?.selectedBy || assignmentState?.completedBy));
  const progressPercent = progressFromTerritory({
    territory: selectedTerritory,
    assignmentState,
    logCount: latestByAddress.size
  });
  const sampleAddresses = useMemo(
    () => (selectedTerritory?.addresses || []).slice(0, 3),
    [selectedTerritory]
  );
  const localityLabel = selectedTerritory?.locality || selectedTerritory?.city || 'Queens';
  const subtitle = loading
    ? 'Connecting live territory geometry and workflow metrics.'
    : `Live geofence view connected to ${source === 'supabase' ? 'Supabase project data' : 'fallback data'} for ${metrics.enabledCount} enabled territories and ${metrics.addressCount.toLocaleString()} addresses.`;

  return (
    <AppShell
      title="Territory Atlas"
      subtitle={subtitle}
      metaPills={[
        { label: localityLabel, tone: 'light' },
        { label: `${metrics.enabledCount} Enabled`, tone: 'dark' }
      ]}
      contentClassName="atlas-page-shell"
    >
      {error ? (
        <div className="info-banner warning">
          Live workspace data could not be fully refreshed. The current atlas is using the best available territory snapshot.
        </div>
      ) : null}

      <section className="atlas-hero-card">
        <div className="atlas-map-header">
          <div className="atlas-chip-row">
            <span className="atlas-chip">{selectedTerritory ? `Territory ${selectedTerritory.territoryNo}` : 'Territory Atlas'}</span>
            <span className="atlas-chip subtle">{selectedTerritory?.territory_state || 'Initial Call'}</span>
          </div>
        </div>

        <div className="atlas-map-stage">
          <PremiumMapCanvas
            territories={territories}
            projected={projected}
            selectedId={selectedId}
            onSelect={setSelectedId}
            zoomLevel={zoomLevel}
            drawMode={drawMode}
          />

          <div className="atlas-map-controls">
            <AtlasControl icon={<PlusIcon />} label="Zoom in" onClick={() => setZoomLevel((current) => Math.min(2.2, Number((current + 0.15).toFixed(2))))} />
            <AtlasControl icon={<MinusIcon />} label="Zoom out" onClick={() => setZoomLevel((current) => Math.max(1, Number((current - 0.15).toFixed(2))))} />
            <AtlasControl icon={<LocateIcon />} label="Center territory" onClick={() => setZoomLevel(1.1)} />
            <AtlasControl icon={<DrawIcon />} label="Draw geofence" active={drawMode} onClick={() => setDrawMode((current) => !current)} />
          </div>

          <aside className="atlas-info-panel">
            <div className="atlas-info-header">
              <div>
                <h2>{selectedTerritory ? `Territory ${selectedTerritory.territoryNo}` : 'Territory'}</h2>
                <p>{territoryLocation(selectedTerritory)}</p>
              </div>
              <span className={`status-pill ${toneForAvailability(availability)}`}>{availability}</span>
            </div>

            <div className="atlas-stat-grid">
              <div className="atlas-stat-card">
                <span>Addresses</span>
                <strong>{selectedTerritory?.addresses?.length ?? 0}</strong>
              </div>
              <div className="atlas-stat-card">
                <span>Territory State</span>
                <strong>{selectedTerritory?.territory_state || 'Initial Call'}</strong>
              </div>
            </div>

            <div className="atlas-progress-block">
              <div className="atlas-progress-header">
                <span>Assignment</span>
                <strong>{derivePersonName(activeUser?.email || assignmentState?.selectedBy || assignmentState?.completedBy || '')}</strong>
              </div>
              <div className="progress-track large">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="atlas-address-header">
              <h3>Sample Addresses</h3>
              <button type="button" className="secondary-action" onClick={() => navigate(`/dashboard?territory=${selectedId || ''}`)}>
                Add Address
              </button>
            </div>

            <div className="atlas-address-list">
              {sampleAddresses.length ? sampleAddresses.map((address, index) => {
                const latestStatus = latestByAddress.get(address.full);
                return (
                  <article key={address.full} className="atlas-address-card">
                    <div className="atlas-address-copy">
                      <h4>{address.full.split(',')[0]}</h4>
                      <p>{compactAddressMeta(address.full)}</p>
                      <small>{latestStatus ? `Last activity: ${badgeLabelForStatusCode(latestStatus.status_code)}` : 'No log activity yet'}</small>
                    </div>
                    <div className="atlas-address-actions">
                      <span className={`status-pill mini ${latestStatus ? 'info' : index === 2 ? 'warning' : 'teal'}`}>
                        {statusPill(latestStatus, index)}
                      </span>
                      <button type="button" className="primary-inline-action" onClick={() => navigate(`/dashboard?territory=${selectedId || ''}&address=${encodeURIComponent(address.full)}`)}>
                        Open
                      </button>
                    </div>
                  </article>
                );
              }) : (
                <div className="empty-inline-card">
                  <SparklesIcon />
                  <p>Select a territory with address inventory to open the operational workflow.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
