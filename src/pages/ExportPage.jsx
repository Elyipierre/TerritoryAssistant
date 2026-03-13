import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import { useTerritories } from '../hooks/useTerritories';
import { useAssignments } from '../hooks/useAssignments';
import { useAdminData } from '../hooks/useAdminData';
import { useOperationalSettings } from '../hooks/useOperationalSettings';
import { useAuth } from '../contexts/AuthContext';
import { downloadBlob, toCsv } from '../utils/download';
import { buildS12Pdf, buildS13Pdf, buildTerritoryAtlasPdf } from '../utils/pdfEngine';
import { getPdfCalibration, savePdfCalibration } from '../utils/localOps';

export default function ExportPage() {
  const { user, profile } = useAuth();
  const { territories, projected, summary, source: territorySource } = useTerritories({ enabledOnly: false });
  const { history, source: historySource } = useAssignments(user?.id, profile?.role);
  const { dncRows, campaigns, source: adminSource } = useAdminData();
  const { settings, source: settingsSource } = useOperationalSettings();
  const [message, setMessage] = useState('');
  const [exportScope, setExportScope] = useState('all');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState('');
  const [serviceYear, setServiceYear] = useState(String(new Date().getFullYear()));
  const [busyKey, setBusyKey] = useState('');
  const [pdfCalibration, setPdfCalibration] = useState(getPdfCalibration());

  const exportRows = useMemo(() => territories.map((territory) => ({
    territory_id: territory.id,
    territory_no: territory.territoryNo,
    locality: territory.locality ?? territory.city ?? '',
    enabled: territory.is_enabled,
    state: territory.territory_state ?? '',
    address_count: territory.addresses?.length ?? 0,
    derived_streets: (territory.streetLabels ?? []).join(' | ')
  })), [territories]);

  const selectedIds = useMemo(() => {
    if (exportScope === 'single' && selectedTerritoryId) return [selectedTerritoryId];
    return [];
  }, [exportScope, selectedTerritoryId]);

  const selectedCount = exportScope === 'single' && selectedTerritoryId ? 1 : territories.length;

  useEffect(() => {
    setPdfCalibration(getPdfCalibration());
  }, []);

  function exportTerritoriesJson() {
    const filtered = selectedIds.length ? territories.filter((territory) => selectedIds.includes(String(territory.territoryNo ?? territory.id))) : territories;
    downloadBlob('territories.export.json', JSON.stringify({ exported_at: new Date().toISOString(), territories: filtered }, null, 2), 'application/json');
    setMessage(`Territory JSON exported for ${selectedIds.length ? '1 territory' : 'all territories'}.`);
  }

  async function exportS13PdfFile() {
    try {
      setBusyKey('s13pdf');
      const blob = await buildS13Pdf({
        history,
        territories,
        serviceYear,
        selectedTerritoryIds: selectedIds,
        calibration: pdfCalibration
      });
      downloadBlob('s13-master-export.pdf', blob);
      setMessage('S-13 PDF exported.');
    } finally {
      setBusyKey('');
    }
  }

  function exportS13AssignmentCsv() {
    const allowed = new Set(selectedIds);
    const rows = history
      .filter((row) => !allowed.size || allowed.has(String(row.territory_id ?? row.territoryNo ?? row.territory_no)))
      .map((row) => ({
        territory_id: row.territory_id,
        action: row.action,
        publisher_id: row.publisher_id,
        action_date: row.action_date
      }));
    downloadBlob('s13-assignment-history.csv', toCsv(rows), 'text/csv;charset=utf-8');
    setMessage('S-13 assignment history CSV exported.');
  }

  async function exportS12PdfFile() {
    try {
      setBusyKey('s12pdf');
      const blob = await buildS12Pdf({
        territories: projected,
        dncRows,
        selectedTerritoryIds: selectedIds,
        calibration: pdfCalibration
      });
      downloadBlob('s12-territory-cards.pdf', blob);
      setMessage('S-12 PDF exported.');
    } finally {
      setBusyKey('');
    }
  }



  async function exportTerritoryAtlasPdfFile() {
    try {
      setBusyKey('atlaspdf');
      const blob = await buildTerritoryAtlasPdf({
        territories: projected,
        selectedTerritoryIds: selectedIds,
        calibration: pdfCalibration
      });
      downloadBlob('territory-atlas.pdf', blob);
      setMessage('Territory atlas PDF exported.');
    } finally {
      setBusyKey('');
    }
  }

  function exportS12TerritoryCardsCsv() {
    const allowed = new Set(selectedIds);
    const rows = territories
      .filter((territory) => !allowed.size || allowed.has(String(territory.territoryNo ?? territory.id)))
      .flatMap((territory) => (territory.addresses ?? []).map((address) => ({
        territory_no: territory.territoryNo,
        address: address.full,
        resident_name: address.name ?? '',
        phone: address.phone ?? '',
        email: address.email ?? ''
      })));
    downloadBlob('s12-territory-cards.csv', toCsv(rows), 'text/csv;charset=utf-8');
    setMessage('S-12 territory card CSV exported.');
  }


  function handleCalibrationChange(key, value) {
    setPdfCalibration((current) => ({ ...current, [key]: Number(value) }));
  }

  function saveCalibration() {
    savePdfCalibration(pdfCalibration);
    setMessage('PDF calibration saved. Future S-12 and S-13 exports will use these offsets.');
  }

  function exportOperationsBundle() {
    const allowed = new Set(selectedIds);
    const filteredRows = exportRows.filter((row) => !allowed.size || allowed.has(String(row.territory_no ?? row.territory_id)));
    const filteredHistory = history.filter((row) => !allowed.size || allowed.has(String(row.territory_id ?? row.territoryNo ?? row.territory_no)));
    const payload = {
      exported_at: new Date().toISOString(),
      summary,
      service_windows: settings,
      campaigns,
      do_not_calls: dncRows.filter((row) => !allowed.size || allowed.has(String(row.territory_id ?? row.territoryNo ?? row.territory_no))),
      territory_rows: filteredRows,
      assignment_history: filteredHistory
    };
    downloadBlob('territory-operations-bundle.json', JSON.stringify(payload, null, 2), 'application/json');
    setMessage('Operations bundle exported.');
  }

  return (
    <AppShell title="Export Center" subtitle="Generate production-ready exports for territory operations, campaign tracking, and assignment history.">
      <div className="kpi-grid">
        <KpiCard label="Territories" value={territories.length} helper={`Source: ${territorySource}`} />
        <KpiCard label="Assignments" value={history.length} helper={`Source: ${historySource}`} />
        <KpiCard label="DNC Rows" value={dncRows.length} helper={`Source: ${adminSource}`} />
        <KpiCard label="Service Windows" value={settingsSource === 'supabase' ? 'Live' : 'Local'} helper={`${settings.telephoneWindowStart}–${settings.telephoneWindowEnd}`} />
      </div>

      {message ? <p className="muted-copy">{message}</p> : null}

      <article className="panel-card export-scope-card">
        <div className="panel-card-header">
          <div>
            <h3>Export Scope</h3>
            <p>Choose whether to export all territories or one specific territory for S-12 and S-13 generation.</p>
          </div>
        </div>
        <div className="two-col select-inline export-form-grid">
          <label>
            <span>Scope</span>
            <select className="state-select" value={exportScope} onChange={(event) => setExportScope(event.target.value)}>
              <option value="all">All territories</option>
              <option value="single">Single territory</option>
            </select>
          </label>
          <label>
            <span>Territory</span>
            <select className="state-select" value={selectedTerritoryId} onChange={(event) => setSelectedTerritoryId(event.target.value)} disabled={exportScope !== 'single'}>
              <option value="">Select territory</option>
              {territories.map((territory) => {
                const value = String(territory.territoryNo ?? territory.id);
                return <option key={value} value={value}>Territory {value} • {territory.locality ?? territory.city ?? 'Unknown locality'}</option>;
              })}
            </select>
          </label>
          <label>
            <span>Service year (S-13)</span>
            <input value={serviceYear} onChange={(event) => setServiceYear(event.target.value)} placeholder="2026" />
          </label>
          <div className="stack-item compact">
            <strong>Ready to export</strong>
            <p>{selectedCount} territory{selectedCount === 1 ? '' : 'ies'} in current export scope.</p>
          </div>
        </div>
      </article>


      <article className="panel-card export-scope-card">
        <div className="panel-card-header">
          <div>
            <h3>PDF Calibration</h3>
            <p>Fine tune S-12 and S-13 overlay positions without changing the official templates.</p>
          </div>
        </div>
        <div className="two-col select-inline export-form-grid">
          <label><span>S-13 X offset</span><input type="number" step="0.5" value={pdfCalibration.s13OffsetX} onChange={(event) => handleCalibrationChange('s13OffsetX', event.target.value)} /></label>
          <label><span>S-13 Y offset</span><input type="number" step="0.5" value={pdfCalibration.s13OffsetY} onChange={(event) => handleCalibrationChange('s13OffsetY', event.target.value)} /></label>
          <label><span>S-13 row nudge</span><input type="number" step="0.25" value={pdfCalibration.s13RowNudge} onChange={(event) => handleCalibrationChange('s13RowNudge', event.target.value)} /></label>
          <label><span>S-12 X offset</span><input type="number" step="0.5" value={pdfCalibration.s12OffsetX} onChange={(event) => handleCalibrationChange('s12OffsetX', event.target.value)} /></label>
          <label><span>S-12 Y offset</span><input type="number" step="0.5" value={pdfCalibration.s12OffsetY} onChange={(event) => handleCalibrationChange('s12OffsetY', event.target.value)} /></label>
          <label><span>S-12 map X offset</span><input type="number" step="0.5" value={pdfCalibration.s12MapOffsetX} onChange={(event) => handleCalibrationChange('s12MapOffsetX', event.target.value)} /></label>
          <label><span>S-12 map Y offset</span><input type="number" step="0.5" value={pdfCalibration.s12MapOffsetY} onChange={(event) => handleCalibrationChange('s12MapOffsetY', event.target.value)} /></label>
          <label><span>S-12 map scale</span><input type="number" step="0.01" value={pdfCalibration.s12MapScale} onChange={(event) => handleCalibrationChange('s12MapScale', event.target.value)} /></label>
          <div className="stack-item compact"><strong>Current preset</strong><p>Use small values like 1, -1, 0.5, or 1.02 for precise print alignment.</p></div>
        </div>
        <div className="action-row"><button className="mini-action" type="button" onClick={saveCalibration}>Save Calibration</button></div>
      </article>

      <div className="grid-panels admin-layout">
        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>S-13 Master Export</h3>
              <p>Overlays assignment history onto the official S-13 template and generates additional pages automatically when rows overflow.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-item compact">
              <strong>Assignment history export</strong>
              <p>{history.length} rows ready for export.</p>
            </div>
            <div className="action-row">
              <button className="shell-signout form-submit" type="button" onClick={exportS13PdfFile} disabled={busyKey === 's13pdf' || (exportScope === 'single' && !selectedTerritoryId)}>{busyKey === 's13pdf' ? 'Building PDF…' : 'Export S-13 PDF'}</button>
              <button className="mini-action" type="button" onClick={exportS13AssignmentCsv}>Export CSV</button>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>S-12 Territory Cards</h3>
              <p>Uses the official territory card template for the front side and adds a generated back side with verified DNC addresses.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-item compact">
              <strong>Address inventory export</strong>
              <p>{territories.reduce((total, territory) => total + (territory.addresses?.length ?? 0), 0)} addresses across all territories.</p>
            </div>
            <div className="action-row">
              <button className="shell-signout form-submit" type="button" onClick={exportS12PdfFile} disabled={busyKey === 's12pdf' || (exportScope === 'single' && !selectedTerritoryId)}>{busyKey === 's12pdf' ? 'Building PDF…' : 'Export S-12 PDF'}</button>
              <button className="mini-action" type="button" onClick={exportS12TerritoryCardsCsv}>Export CSV</button>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Territory Geometry Backup</h3>
              <p>Exports the current territory records, states, and derived streets as JSON for GitHub or backup storage.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-item compact">
              <strong>Territory JSON export</strong>
              <p>{exportRows.length} territory rows prepared.</p>
            </div>
            <button className="shell-signout form-submit" type="button" onClick={exportTerritoriesJson}>Export Territory JSON</button>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Operations Bundle</h3>
              <p>One-click export with territories, campaigns, service windows, DNC rows, and assignment history.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-item compact">
              <strong>Unified JSON package</strong>
              <p>Includes campaign rows, current service windows, and enabled-pool summary.</p>
            </div>
            <button className="shell-signout form-submit" type="button" onClick={exportOperationsBundle}>Export Operations Bundle</button>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
