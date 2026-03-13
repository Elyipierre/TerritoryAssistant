import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useTerritories } from '../hooks/useTerritories';
import { useAuth } from '../contexts/AuthContext';
import { downloadBlob } from '../utils/download';
import { appendLegacyEngineHistory, readLegacyEngineHistory } from '../utils/legacyEngineBridge';

const ENGINE_SRC = '/legacy/territory-management.html';
const MODE_STORAGE_KEY = 'territory-assistant:engine-launch-mode';
const CAMPAIGN_STORAGE_KEY = 'territory-assistant:engine-campaign-name';

const LEGACY_ACTIONS = [
  { key: 'draw', label: 'Draw Polygon', method: 'triggerDrawPolygon' },
  { key: 'edit', label: 'Edit Layers', method: 'triggerEditLayers' },
  { key: 'labels', label: 'Adjust Labels', method: 'triggerAdjustLabels' },
  { key: 'refresh', label: 'Fetch Residential Addresses', method: 'triggerRefreshSelected' },
  { key: 'print', label: 'Print Territory Card', method: 'triggerPrintSelected' },
  { key: 'printRecord', label: 'Print Territory Record', method: 'triggerPrintRecord' },
  { key: 'import', label: 'Import Territory Backup', method: 'triggerImportBackup' },
  { key: 'download', label: 'Download Territory Backup', method: 'triggerDownloadBackup' },
  { key: 'delete', label: 'Delete Selected Territory', method: 'triggerDeleteSelected', danger: true },
  { key: 'clear', label: 'Clear All Territories', method: 'triggerClearAll', danger: true }
];

function safeReadSelectedTerritory() {
  try {
    const stored = window.localStorage.getItem('territory-assistant:selected-territory');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function readCampaignContext() {
  try {
    const activeCampaign = JSON.parse(window.localStorage.getItem('territory-assistant:active-campaign') || 'null');
    return {
      campaignName: window.localStorage.getItem(CAMPAIGN_STORAGE_KEY) || activeCampaign?.name || '',
      campaignActive: Boolean(activeCampaign?.id || activeCampaign?.name)
    };
  } catch {
    return { campaignName: '', campaignActive: false };
  }
}

export default function AdminTerritoryEnginePage() {
  const { profile } = useAuth();
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [launchMode, setLaunchMode] = useState('all');
  const [iframeKey, setIframeKey] = useState(0);
  const [actionMessage, setActionMessage] = useState('');
  const [engineReady, setEngineReady] = useState(false);
  const [engineState, setEngineState] = useState(null);
  const [engineLogs, setEngineLogs] = useState([]);
  const [bridgeHistory, setBridgeHistory] = useState(() => readLegacyEngineHistory());
  const iframeRef = useRef(null);
  const { territories, source } = useTerritories({ enabledOnly: false });

  const { campaignName, campaignActive } = readCampaignContext();
  const hasCampaignControl = profile?.role === 'Admin' || profile?.role === 'Conductor';

  useEffect(() => {
    try {
      const stored = safeReadSelectedTerritory();
      const mode = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (stored) setSelectedTerritory(stored);
      if (mode) setLaunchMode(mode);
      setBridgeHistory(readLegacyEngineHistory());
      setBridgeHistory(readLegacyEngineHistory());
    } catch {}

    const handler = () => {
      try {
        const stored = safeReadSelectedTerritory();
        const mode = window.localStorage.getItem(MODE_STORAGE_KEY);
        if (stored) setSelectedTerritory(stored);
        if (mode) setLaunchMode(mode);
      } catch {}
    };

    window.addEventListener('territory-assistant:selected-territory-changed', handler);
    window.addEventListener('territory-assistant:engine-history-changed', handler);
    return () => {
      window.removeEventListener('territory-assistant:selected-territory-changed', handler);
      window.removeEventListener('territory-assistant:engine-history-changed', handler);
    };
  }, []);

  const stats = useMemo(() => {
    const enabled = territories.filter((territory) => territory.is_enabled).length;
    const campaignReady = territories.filter((territory) => territory.territory_state === 'Initial Call' || territory.territory_state === '2nd Call' || territory.territory_state === 'Letter Writing').length;
    const selected = territories.filter((territory) => territory.is_selected).length;
    const completed = territories.filter((territory) => territory.is_completed).length;
    return {
      total: territories.length,
      enabled,
      campaignReady,
      selected,
      completed
    };
  }, [territories]);

  const operationalTerritoryRows = useMemo(() => territories.map((territory) => ({
    id: territory.id,
    territoryNo: territory.territoryNo ?? territory.id,
    locality: territory.locality ?? territory.city ?? '',
    state: territory.territory_state ?? 'Available',
    enabled: Boolean(territory.is_enabled),
    selected: Boolean(territory.is_selected),
    completed: Boolean(territory.is_completed),
    addressCount: Array.isArray(territory.addresses) ? territory.addresses.length : 0
  })), [territories]);

  const territoryOptions = useMemo(() => territories.map((territory) => ({
    id: territory.id,
    label: `Territory ${territory.territoryNo ?? territory.id}${territory.locality ? ` • ${territory.locality}` : ''}`,
    territoryNo: territory.territoryNo ?? territory.id,
    locality: territory.locality ?? territory.city ?? '',
    territoryState: territory.territory_state ?? 'Available',
    addressCount: Array.isArray(territory.addresses) ? territory.addresses.length : 0,
    streets: Array.isArray(territory.addresses)
      ? territory.addresses.map((row) => row?.street).filter(Boolean).slice(0, 4)
      : []
  })), [territories]);

  function updateLaunchMode(mode) {
    setLaunchMode(mode);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
      appendLegacyEngineHistory({ kind: 'shell-mode-stage', territoryId: selectedTerritory?.id ?? null, territoryNo: selectedTerritory?.territoryNo ?? null, launchMode: mode, campaignName: campaignName || '', source: 'shell', role: profile?.role || null });
      setBridgeHistory(readLegacyEngineHistory());
      setActionMessage(`Territory Engine launch mode staged as ${mode === 'selected' ? 'Selected Territory' : mode === 'campaign' ? 'Campaign Mode' : 'All Territories'}.`);
    } catch (error) {
      setActionMessage(error?.message || 'Unable to stage launch mode.');
    }
  }

  function refreshEmbeddedEngine() {
    setIframeKey((value) => value + 1);
    setEngineReady(false);
    setEngineLogs([]);
    appendLegacyEngineHistory({ kind: 'engine-refresh', territoryId: selectedTerritory?.id ?? null, territoryNo: selectedTerritory?.territoryNo ?? null, launchMode, campaignName: campaignName || '', source: 'shell', role: profile?.role || null });
    setBridgeHistory(readLegacyEngineHistory());
    setActionMessage('Territory Engine refreshed with the latest staged context.');
  }

  function openInNewTab() {
    window.open(ENGINE_SRC, '_blank', 'noreferrer');
  }

  function exportCurrentBackup() {
    downloadBlob(
      'territory-backup-react-shell.json',
      JSON.stringify({
        exported_at: new Date().toISOString(),
        source,
        launchMode,
        selectedTerritory,
        territories
      }, null, 2),
      'application/json'
    );
    appendLegacyEngineHistory({ kind: 'backup-export', territoryId: selectedTerritory?.id ?? null, territoryNo: selectedTerritory?.territoryNo ?? null, launchMode, campaignName: campaignName || '', source: 'shell', role: profile?.role || null });
    setBridgeHistory(readLegacyEngineHistory());
    setActionMessage('Current territory backup exported from the React shell.');
  }

  function getBridge() {
    try {
      return iframeRef.current?.contentWindow?.TerritoryApp?.bridge || null;
    } catch {
      return null;
    }
  }

  function readLogs() {
    try {
      const logs = iframeRef.current?.contentWindow?.TerritoryApp?.getLogs?.() || [];
      setEngineLogs(Array.isArray(logs) ? logs.slice(-8).reverse() : []);
    } catch {}
  }

  function syncEngineState() {
    const bridge = getBridge();
    if (!bridge?.getState) return;
    try {
      const state = bridge.getState();
      setEngineState(state);
      if (state?.selectedId) {
        const matched = territoryOptions.find((territory) => String(territory.id) === String(state.selectedId) || String(territory.territoryNo) === String(state.selectedId));
        if (matched) {
          setSelectedTerritory((current) => current?.id === matched.id ? current : matched);
        }
      }
    } catch {}
    readLogs();
  }

  const continuitySummary = useMemo(() => ({
    territoryAligned: Boolean(selectedTerritory && engineState?.territoryNo && String(selectedTerritory.territoryNo) === String(engineState.territoryNo)),
    modeAligned: (engineState?.viewMode || launchMode) === launchMode,
    campaignAligned: Boolean((campaignName || '') === (engineState?.campaignName || campaignName || '')),
    selectedLabel: selectedTerritory?.territoryNo ?? '—',
    engineLabel: engineState?.territoryNo ?? '—'
  }), [selectedTerritory, engineState, launchMode, campaignName]);

  const recentBridgeEvents = useMemo(() => bridgeHistory.slice(0, 8), [bridgeHistory]);

  function setEngineViewMode(nextMode) {
    const bridge = getBridge();
    if (!bridge?.setViewMode) {
      setActionMessage('The preserved engine view controls are not ready yet.');
      return;
    }
    try {
      bridge.setViewMode(nextMode);
      syncEngineState();
      appendLegacyEngineHistory({ kind: 'engine-view-switch', territoryId: selectedTerritory?.id ?? null, territoryNo: selectedTerritory?.territoryNo ?? null, launchMode: nextMode, campaignName: campaignName || '', source: 'engine', role: profile?.role || null });
      setBridgeHistory(readLegacyEngineHistory());
      setActionMessage(`Preserved engine switched to ${nextMode === 'selected' ? 'Selected Territory' : nextMode === 'campaign' ? 'Campaign Mode' : 'All Territories'}.`);
    } catch (error) {
      setActionMessage(error?.message || 'Unable to change the preserved engine mode.');
    }
  }

  function syncShellFromEngine() {
    if (!engineState) {
      setActionMessage('The preserved engine has not reported a live state yet.');
      return;
    }
    if (engineState?.viewMode) updateLaunchMode(engineState.viewMode);
    if (engineState?.selectedId) {
      const matched = territoryOptions.find((territory) => String(territory.id) === String(engineState.selectedId) || String(territory.territoryNo) === String(engineState.selectedId));
      if (matched) stageSelectedTerritory(matched.id);
    }
    appendLegacyEngineHistory({ kind: 'shell-sync-from-engine', territoryId: engineState?.selectedId ?? null, territoryNo: engineState?.territoryNo ?? null, launchMode: engineState?.viewMode || launchMode, campaignName: campaignName || '', source: 'engine', role: profile?.role || null });
    setBridgeHistory(readLegacyEngineHistory());
    setActionMessage('Shell context synchronized from the preserved engine state.');
  }

  useEffect(() => {
    if (!engineReady) return undefined;
    const id = window.setInterval(() => {
      syncEngineState();
    }, 2500);
    return () => window.clearInterval(id);
  }, [engineReady, territoryOptions]);

  function stageSelectedTerritory(nextValue) {
    const matched = territoryOptions.find((territory) => String(territory.id) === String(nextValue) || String(territory.territoryNo) === String(nextValue));
    if (!matched) return;
    setSelectedTerritory(matched);
    try {
      window.localStorage.setItem('territory-assistant:selected-territory', JSON.stringify({
        id: matched.id,
        territoryNo: matched.territoryNo,
        locality: matched.locality,
        territoryState: matched.territoryState,
        addressCount: matched.addressCount,
        streets: matched.streets,
        campaignName: campaignName || null
      }));
      window.dispatchEvent(new CustomEvent('territory-assistant:selected-territory-changed', { detail: matched.id }));
      appendLegacyEngineHistory({ kind: 'shell-territory-stage', territoryId: matched.id, territoryNo: matched.territoryNo, launchMode, campaignName: campaignName || '', source: 'shell', role: profile?.role || null });
      setBridgeHistory(readLegacyEngineHistory());
      setActionMessage(`Staged Territory ${matched.territoryNo} for the preserved engine.`);
    } catch (error) {
      setActionMessage(error?.message || 'Unable to stage the selected territory.');
    }
  }

  function pushContextIntoEngine() {
    const bridge = getBridge();
    if (!bridge) {
      setActionMessage('The preserved engine is still loading.');
      return;
    }
    try {
      bridge.stageLaunchContext({
        territoryId: selectedTerritory?.id || '',
        mode: launchMode,
        campaignName
      });
      syncEngineState();
      appendLegacyEngineHistory({ kind: 'shell-push-engine', territoryId: selectedTerritory?.id ?? null, territoryNo: selectedTerritory?.territoryNo ?? null, launchMode, campaignName: campaignName || '', source: 'shell', role: profile?.role || null });
      setBridgeHistory(readLegacyEngineHistory());
      setActionMessage(`Sent ${selectedTerritory ? `Territory ${selectedTerritory.territoryNo}` : 'current context'} into the preserved engine.`);
    } catch (error) {
      setActionMessage(error?.message || 'Unable to sync context into the preserved engine.');
    }
  }

  function handleLegacyAction(methodName) {
    const bridge = getBridge();
    if (!bridge?.[methodName]) {
      setActionMessage('That preserved tool is not ready yet.');
      return;
    }
    try {
      if (selectedTerritory) {
        bridge.stageLaunchContext({ territoryId: selectedTerritory.id, mode: launchMode, campaignName });
      }
      const ok = bridge[methodName]();
      syncEngineState();
      appendLegacyEngineHistory({ kind: `tool:${methodName}`, territoryId: selectedTerritory?.id ?? null, territoryNo: selectedTerritory?.territoryNo ?? null, launchMode, campaignName: campaignName || '', source: 'engine', role: profile?.role || null });
      setBridgeHistory(readLegacyEngineHistory());
      setActionMessage(ok === false ? 'The preserved engine could not complete that action.' : 'Territory tool action sent to the preserved engine.');
    } catch (error) {
      setActionMessage(error?.message || 'Unable to trigger the preserved tool action.');
    }
  }


  function focusShellTerritory(territoryId) {
    stageSelectedTerritory(territoryId);
    appendLegacyEngineHistory({ kind: 'shell-focus', territoryId, territoryNo: territoryOptions.find((territory) => territory.id === territoryId)?.territoryNo ?? territoryId, launchMode, campaignName: campaignName || '', source: 'shell', role: profile?.role || null });
    setBridgeHistory(readLegacyEngineHistory());
    setActionMessage(`Territory ${territoryId} focused in the premium shell.`);
  }

  function sendTerritoryDirectlyToEngine(territoryId) {
    stageSelectedTerritory(territoryId);
    window.setTimeout(() => {
      pushContextIntoEngine();
    }, 0);
  }

  function engineStateLabel(row) {
    if (row.completed) return 'Completed';
    if (row.selected) return 'Selected';
    if (row.enabled) return row.state;
    return 'Disabled';
  }

  function handleIframeLoad() {
    setEngineReady(true);
    setTimeout(() => {
      pushContextIntoEngine();
      syncEngineState();
    }, 250);
  }

  return (
    <AppShell
      title="Admin Territory Engine"
      subtitle="Your original territory-management workspace is preserved intact here so Draw Polygon, Edit Layers, Adjust Labels, import/export backup, map modes, Territory Tools, and deletion workflows keep behaving exactly the way you built them."
    >
      <div className="legacy-engine-frame-wrap">
        <div className="panel-card legacy-engine-banner">
          <div>
            <h3>Original Territory Management PRO</h3>
            <p>
              This preserved engine remains the canonical workspace for your exact territory tools. The premium shell now stages selected territory, launch mode, and campaign context before handing work into the original map engine.
            </p>
            {selectedTerritory ? (
              <div className="engine-focus-pill">
                <strong>Focused from shell:</strong> Territory {selectedTerritory.territoryNo ?? selectedTerritory.id}
                {selectedTerritory.locality ? ` • ${selectedTerritory.locality}` : ''}
                {selectedTerritory.territoryState ? ` • ${selectedTerritory.territoryState}` : ''}
                {selectedTerritory.addressCount ? ` • ${selectedTerritory.addressCount} addresses` : ''}
                {selectedTerritory.streets?.length ? ` • ${selectedTerritory.streets.join(' • ')}` : ''}
                {campaignName ? ` • ${campaignName}` : ''}
              </div>
            ) : null}
            <div className="engine-tools-strip">
              <div className="engine-tools-group">
                <span className="engine-tools-label">Launch Context</span>
                <div className="map-mode-toggle compact" role="tablist" aria-label="Preserved engine launch mode">
                  <button type="button" className={launchMode === 'selected' ? 'active' : ''} onClick={() => updateLaunchMode('selected')}>Selected Territory</button>
                  <button type="button" className={launchMode === 'all' ? 'active' : ''} onClick={() => updateLaunchMode('all')}>All Territories</button>
                  <button type="button" className={launchMode === 'campaign' ? 'active' : ''} onClick={() => updateLaunchMode('campaign')}>Campaign Mode</button>
                </div>
              </div>
              <div className="engine-tools-group metrics">
                <span className="engine-tools-label">Current Shell Snapshot</span>
                <div className="engine-metric-pill">Total {stats.total}</div>
                <div className="engine-metric-pill">Enabled {stats.enabled}</div>
                <div className="engine-metric-pill">Campaign Ready {stats.campaignReady}</div>
                {campaignName ? <div className="engine-metric-pill accent">{campaignName}</div> : null}
                {profile?.role ? <div className="engine-metric-pill">Role {profile.role}</div> : null}
                {campaignActive ? <div className="engine-metric-pill accent">Campaign Active</div> : null}
                {hasCampaignControl ? <div className="engine-metric-pill">Campaign Control</div> : null}
              </div>
              <div className="engine-tools-group territory-bridge-panel">
                <span className="engine-tools-label">Territory Bridge</span>
                <div className="engine-bridge-row">
                  <select
                    className="shell-select"
                    value={selectedTerritory?.id ?? ''}
                    onChange={(event) => stageSelectedTerritory(event.target.value)}
                  >
                    <option value="">Select a territory…</option>
                    {territoryOptions.map((territory) => (
                      <option key={territory.id} value={territory.id}>{territory.label}</option>
                    ))}
                  </select>
                  <button className="mini-action" type="button" onClick={pushContextIntoEngine} disabled={!engineReady}>Send to Engine</button>
                  <button className="mini-action ghost" type="button" onClick={syncEngineState} disabled={!engineReady}>Read Engine State</button>
                </div>
              </div>
              <div className="engine-tools-group">
                <span className="engine-tools-label">Live Engine View Controls</span>
                <div className="map-mode-toggle compact" role="tablist" aria-label="Preserved engine view mode">
                  <button type="button" className={engineState?.viewMode === 'selected' ? 'active' : ''} onClick={() => setEngineViewMode('selected')} disabled={!engineReady}>Selected</button>
                  <button type="button" className={engineState?.viewMode === 'all' ? 'active' : ''} onClick={() => setEngineViewMode('all')} disabled={!engineReady}>All</button>
                  <button type="button" className={engineState?.viewMode === 'campaign' ? 'active' : ''} onClick={() => setEngineViewMode('campaign')} disabled={!engineReady}>Campaign</button>
                </div>
              </div>
              <div className="engine-tools-group">
                <span className="engine-tools-label">Preserved Territory Tools</span>
                <div className="engine-quick-actions-grid">
                  {LEGACY_ACTIONS.map((action) => (
                    <button
                      key={action.key}
                      className={`mini-action${action.danger ? ' ghost danger' : ''}`}
                      type="button"
                      onClick={() => handleLegacyAction(action.method)}
                      disabled={!engineReady}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="action-row">
                <button className="mini-action" type="button" onClick={refreshEmbeddedEngine}>Refresh Embedded Engine</button>
                <button className="mini-action" type="button" onClick={exportCurrentBackup}>Download Current Backup</button>
                <a className="mini-action" href={ENGINE_SRC} target="_blank" rel="noreferrer" onClick={openInNewTab}>Open in new tab</a>
              </div>
            </div>
            {actionMessage ? <p className="muted-copy" style={{ marginTop: 12 }}>{actionMessage}</p> : null}
          </div>
        </div>

        <div className="engine-state-grid">
          <article className="panel-card engine-state-panel">
            <div className="panel-card-header compact">
              <div>
                <h3>Live Engine Telemetry</h3>
                <p>Read directly from the preserved engine so the React shell can surface its current territory focus and mode.</p>
              </div>
            </div>
            <div className="engine-state-pills">
              <div className="engine-metric-pill">Engine {engineReady ? 'Ready' : 'Loading'}</div>
              <div className="engine-metric-pill">Mode {engineState?.viewMode || launchMode}</div>
              <div className="engine-metric-pill">Selected {engineState?.territoryNo || selectedTerritory?.territoryNo || '—'}</div>
              <div className="engine-metric-pill">Locality {engineState?.locality || selectedTerritory?.locality || '—'}</div>
              <div className="engine-metric-pill">Addresses {engineState?.addressCount ?? selectedTerritory?.addressCount ?? 0}</div>
              <div className="engine-metric-pill">Engine Total {engineState?.totalTerritories ?? stats.total}</div>
            </div>
          </article>

          <article className="panel-card engine-state-panel">
            <div className="panel-card-header compact">
              <div>
                <h3>Recent Engine Signals</h3>
                <p>Surface the latest preserved-engine events here so you can verify mode switches, focus changes, and admin tool activity without leaving the shell.</p>
              </div>
              <button className="mini-action ghost" type="button" onClick={syncEngineState} disabled={!engineReady}>Refresh Signals</button>
            </div>
            <div className="engine-log-list">
              {engineLogs.length ? engineLogs.map((entry, index) => (
                <div className="engine-log-item" key={`${entry?.ts || 'log'}-${index}`}>
                  <strong>{entry?.level || 'info'}</strong>
                  <span>{entry?.event || 'engine.event'}</span>
                  <p>{entry?.payload?.message || entry?.payload?.mode || entry?.payload?.territoryId || 'Preserved engine activity logged.'}</p>
                </div>
              )) : (
                <div className="empty-state compact">
                  <h4>No engine signals yet</h4>
                  <p>Once the preserved engine starts logging interactions, the latest events will appear here.</p>
                </div>
              )}
            </div>
          </article>
        </div>


        <div className="engine-state-grid operational-grid">
          <article className="panel-card engine-state-panel">
            <div className="panel-card-header compact">
              <div>
                <h3>All Territories Operational State</h3>
                <p>Mirror the original all-territories operational footprint here without replacing the preserved engine. Focus a territory in the shell, then hand it directly into the legacy workspace when needed.</p>
              </div>
            </div>
            <div className="engine-state-pills">
              <div className="engine-metric-pill">Total {stats.total}</div>
              <div className="engine-metric-pill">Enabled {stats.enabled}</div>
              <div className="engine-metric-pill">Selected {stats.selected}</div>
              <div className="engine-metric-pill">Completed {stats.completed}</div>
              <div className="engine-metric-pill">Campaign Ready {stats.campaignReady}</div>
            </div>
            <div className="engine-operational-list">
              {operationalTerritoryRows.slice(0, 18).map((row) => (
                <div className={`engine-operational-item${selectedTerritory?.id === row.id ? ' active' : ''}`} key={`engine-operational-${row.id}`}>
                  <div>
                    <strong>Territory {row.territoryNo}</strong>
                    <p>{row.locality || 'Territory ready'} • {row.addressCount} addresses • {engineStateLabel(row)}</p>
                  </div>
                  <div className="action-row compact-wrap">
                    <button className="mini-action ghost" type="button" onClick={() => focusShellTerritory(row.id)}>Focus</button>
                    <button className="mini-action" type="button" onClick={() => sendTerritoryDirectlyToEngine(row.id)} disabled={!engineReady}>Send to Engine</button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card engine-state-panel">
            <div className="panel-card-header compact">
              <div>
                <h3>Selected Territory Continuity</h3>
                <p>Track the exact territory currently flowing between the premium dashboard shell and the preserved territory engine.</p>
              </div>
            </div>
            <div className="stack-list compact-stack">
              <div className="stack-item compact">
                <strong>Shell Focus</strong>
                <p>{selectedTerritory ? `Territory ${selectedTerritory.territoryNo} • ${selectedTerritory.locality || 'Locality pending'} • ${selectedTerritory.addressCount || 0} addresses` : 'No shell territory focused yet.'}</p>
              </div>
              <div className="stack-item compact">
                <strong>Engine Focus</strong>
                <p>{engineState?.territoryNo ? `Territory ${engineState.territoryNo} • ${engineState.locality || 'Locality pending'} • ${engineState.addressCount ?? 0} addresses` : 'The preserved engine has not reported a focused territory yet.'}</p>
              </div>
              <div className="stack-item compact">
                <strong>Continuity Status</strong>
                <p>{selectedTerritory?.territoryNo && engineState?.territoryNo && String(selectedTerritory.territoryNo) === String(engineState.territoryNo) ? 'Shell and preserved engine are aligned on the same territory.' : 'Use Focus / Send to Engine / Read Engine State to keep both surfaces synchronized.'}</p>
              </div>
            </div>
            <div className="engine-bridge-matrix" style={{ marginTop: 12 }}>
              <div className={`bridge-chip${continuitySummary.territoryAligned ? ' active' : ''}`}>Territory {continuitySummary.territoryAligned ? 'Aligned' : `${continuitySummary.selectedLabel} → ${continuitySummary.engineLabel}`}</div>
              <div className={`bridge-chip${continuitySummary.modeAligned ? ' active' : ''}`}>Mode {continuitySummary.modeAligned ? 'Aligned' : `Engine ${engineState?.viewMode || launchMode}`}</div>
              <div className={`bridge-chip${continuitySummary.campaignAligned ? ' active' : ''}`}>{campaignName ? (continuitySummary.campaignAligned ? 'Campaign Aligned' : `Campaign ${campaignName}`) : 'No Campaign Context'}</div>
            </div>
            <div className="action-row compact-wrap" style={{ marginTop: 12 }}>
              <button className="mini-action ghost" type="button" onClick={syncShellFromEngine} disabled={!engineReady}>Sync Shell from Engine</button>
              <button className="mini-action" type="button" onClick={pushContextIntoEngine} disabled={!engineReady}>Push Shell to Engine</button>
            </div>
          </article>
        </div>


        <div className="engine-state-grid">
          <article className="panel-card engine-state-panel">
            <div className="panel-card-header compact">
              <div>
                <h3>Continuity Timeline</h3>
                <p>Track the latest territory, mode, backup, and tool events flowing through the premium shell and preserved engine bridge.</p>
              </div>
            </div>
            <div className="engine-log-list">
              {recentBridgeEvents.length ? recentBridgeEvents.map((entry) => (
                <div className="engine-log-item" key={entry.id}>
                  <strong>{entry.kind || 'bridge-event'}</strong>
                  <span>{entry.launchMode || launchMode} • {entry.source || 'shell'}</span>
                  <p>{entry.territoryNo ? `Territory ${entry.territoryNo}` : 'No territory staged'}{entry.campaignName ? ` • ${entry.campaignName}` : ''}</p>
                </div>
              )) : (
                <div className="empty-state compact">
                  <h4>No continuity events yet</h4>
                  <p>As the shell and preserved engine exchange context, the bridge timeline will appear here.</p>
                </div>
              )}
            </div>
          </article>

          <article className="panel-card engine-state-panel">
            <div className="panel-card-header compact">
              <div>
                <h3>Campaign Continuity Matrix</h3>
                <p>Confirm that shell role authority, campaign supersession, and preserved engine mode all remain aligned.</p>
              </div>
            </div>
            <div className="engine-bridge-matrix">
              <div className={`bridge-chip${continuitySummary.modeAligned ? ' active' : ''}`}>Shell {launchMode}</div>
              <div className={`bridge-chip${continuitySummary.modeAligned ? ' active' : ''}`}>Engine {engineState?.viewMode || 'pending'}</div>
              <div className={`bridge-chip${continuitySummary.campaignAligned ? ' active' : ''}`}>{campaignName || 'No Campaign'}</div>
              <div className="bridge-chip">Role {profile?.role || 'User'}</div>
              <div className={`bridge-chip${campaignActive ? ' active' : ''}`}>{campaignActive ? 'Campaign Superseding' : 'Standard Territory Mode'}</div>
              <div className={`bridge-chip${hasCampaignControl ? ' active' : ''}`}>{hasCampaignControl ? 'Control Enabled' : 'View Context'}</div>
            </div>
          </article>
        </div>

        <iframe
          key={iframeKey}
          ref={iframeRef}
          title="Original Territory Management PRO"
          src={ENGINE_SRC}
          className="legacy-engine-frame"
          onLoad={handleIframeLoad}
        />
      </div>
    </AppShell>
  );
}
