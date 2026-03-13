import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import PremiumMapCanvas from '../components/PremiumMapCanvas';
import { AtlasIcon, BellIcon, CalendarIcon, DatabaseIcon, FileIcon, ShieldIcon, SparklesIcon } from '../components/Icons';
import { useAdminData } from '../hooks/useAdminData';
import { useAssignments } from '../hooks/useAssignments';
import { useOperationalSettings } from '../hooks/useOperationalSettings';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { territoryLocation, toneForTerritoryState } from '../utils/presentation';
import { projectTerritories } from '../utils/territoryMap';
import { buildS12Pdf, buildS13Pdf, buildTerritoryAtlasPdf } from '../utils/pdfEngine';
import { downloadBlob } from '../utils/download';

const STATES = ['', 'Initial Call', '2nd Call', 'Letter Writing'];
const ROLES = ['Admin', 'Conductor', 'Publisher'];
const SECTIONS = [
  ['access', 'Access Provisioning', ShieldIcon],
  ['geo', 'Geospatial Management', AtlasIcon],
  ['compliance', 'Compliance Registry', BellIcon],
  ['enrichment', 'Data Enrichment', DatabaseIcon],
  ['ministry', 'Ministry Orchestration', CalendarIcon],
  ['campaigns', 'Campaign Management', SparklesIcon],
  ['documents', 'Document Engine', FileIcon],
  ['config', 'System Configuration', BellIcon]
];

export default function AdminPage() {
  const { user, profile } = useAuth();
  const {
    territories,
    users,
    dncRows,
    campaigns,
    reviewQueues,
    addressInventory,
    accessRequests,
    busy,
    updateTerritory,
    updateUserRole,
    createCampaign,
    verifyDnc,
    approveAccessRequest,
    rejectAccessRequest,
    resolveReviewItem,
    createVerifiedDncFromReview,
    refresh
  } = useAdminData();
  const { history } = useAssignments(user?.id, profile?.role);
  const { settings, save: saveSettings } = useOperationalSettings();
  const [activeSection, setActiveSection] = useState('access');
  const [message, setMessage] = useState('');
  const [selectedGeoId, setSelectedGeoId] = useState('');
  const [serviceForm, setServiceForm] = useState(settings);
  const [campaignForm, setCampaignForm] = useState({ name: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', defaultEnabledToInitialCalls: true });
  const [reviewTab, setReviewTab] = useState('phoneConflicts');
  const [selectedReviewKey, setSelectedReviewKey] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [exportScope, setExportScope] = useState('all');
  const [selectedExportId, setSelectedExportId] = useState('');
  const [busyExportKey, setBusyExportKey] = useState('');

  useEffect(() => setServiceForm(settings), [settings]);
  useEffect(() => {
    if (!territories.length) return;
    const preferred = territories.find((territory) => String(territory.territoryNo) === '5') ?? territories[0];
    setSelectedGeoId((current) => current || preferred?.id || '');
  }, [territories]);

  const pendingRequests = accessRequests.filter((request) => request.status === 'pending');
  const projected = useMemo(() => projectTerritories(territories), [territories]);
  const selectedGeoTerritory = territories.find((territory) => String(territory.id) === String(selectedGeoId)) ?? territories[0] ?? null;
  const currentReviewItems = reviewQueues[reviewTab] || [];
  const selectedReviewItem = currentReviewItems.find((item) => item.resolutionKey === selectedReviewKey) || currentReviewItems[0] || null;
  const exportIds = exportScope === 'single' && selectedExportId ? [selectedExportId] : [];

  useEffect(() => {
    if (!selectedReviewItem) {
      setSelectedReviewKey('');
      setReviewNotes('');
      return;
    }
    setSelectedReviewKey(selectedReviewItem.resolutionKey);
    setReviewNotes(selectedReviewItem.resolution?.notes || '');
  }, [selectedReviewItem?.resolutionKey, selectedReviewItem?.resolution?.notes]);

  async function handleTerritoryPatch(patch) {
    if (!selectedGeoTerritory) return;
    try {
      await updateTerritory(selectedGeoTerritory.id, patch);
      setMessage('Territory settings saved.');
    } catch (error) {
      setMessage(error.message || 'Unable to update territory.');
    }
  }

  async function handleRoleUpdate(userId, role) {
    try {
      await updateUserRole(userId, { role });
      setMessage('User role updated.');
    } catch (error) {
      setMessage(error.message || 'Unable to update user role.');
    }
  }

  async function handleApprove(request, role) {
    const result = await approveAccessRequest(request, { role });
    setMessage(result.ok ? 'Access request approved.' : 'Approval saved locally because Supabase was unavailable.');
  }

  async function handleCampaignSubmit(event) {
    event.preventDefault();
    const result = await createCampaign(campaignForm, { defaultEnabledToInitialCalls: campaignForm.defaultEnabledToInitialCalls });
    setMessage(result.ok ? 'Campaign created successfully.' : (result.error?.message || 'Unable to create campaign.'));
    if (result.ok) setCampaignForm((current) => ({ ...current, name: '', end_date: '' }));
  }

  async function toggleCampaign(campaign) {
    const { error } = await supabase.from('campaigns').update({ is_active: !campaign.is_active }).eq('id', campaign.id);
    if (error) {
      setMessage(error.message || 'Unable to toggle campaign.');
      return;
    }
    await refresh();
    setMessage('Campaign state updated.');
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    const result = await saveSettings(serviceForm);
    setMessage(result.ok ? 'System configuration saved.' : 'Settings were saved locally because the settings table was unavailable.');
  }

  async function handleResolveReview(resolved) {
    if (!selectedReviewItem) return;
    await resolveReviewItem(reviewTab, selectedReviewItem.resolutionKey, resolved, reviewNotes.trim() || (resolved ? 'Resolved in admin panel' : 'Reopened in admin panel'));
    setMessage(resolved ? 'Review item resolved.' : 'Review item reopened.');
  }

  async function handleCreateReviewDnc() {
    if (!selectedReviewItem) return;
    const result = await createVerifiedDncFromReview(selectedReviewItem, reviewNotes.trim());
    setMessage(result.ok ? 'Verified DNC created from review item.' : 'Saved a local DNC placeholder because Supabase insert failed.');
  }

  async function buildExport(type) {
    try {
      setBusyExportKey(type);
      if (type === 's12') downloadBlob('territory-s12.pdf', await buildS12Pdf({ territories: projected, dncRows, selectedTerritoryIds: exportIds }));
      if (type === 's13') downloadBlob('territory-s13.pdf', await buildS13Pdf({ territories, history, serviceYear: String(new Date().getFullYear()), selectedTerritoryIds: exportIds }));
      if (type === 'atlas') downloadBlob('territory-atlas.pdf', await buildTerritoryAtlasPdf({ territories: projected, selectedTerritoryIds: exportIds }));
      setMessage('Document export started.');
    } finally {
      setBusyExportKey('');
    }
  }

  return (
    <AppShell
      title="Admin Panel"
      subtitle="A nested enterprise control plane for access, mapping, compliance, campaigns, document output, and system defaults."
      metaPills={[
        { label: `${territories.filter((territory) => territory.is_enabled).length} Live`, tone: 'light' },
        { label: `${campaigns.filter((campaign) => campaign.is_active).length} Active Campaigns`, tone: 'dark' }
      ]}
      contentClassName="admin-page-shell"
    >
      <div className="kpi-grid">
        <KpiCard label="Users" value={users.length} helper={`${pendingRequests.length} pending approvals`} icon={<ShieldIcon />} />
        <KpiCard label="Address Inventory" value={addressInventory.total || 0} helper={`${addressInventory.reviewFlags || 0} rows flagged for review`} accent="blue" icon={<DatabaseIcon />} />
        <KpiCard label="DNC Registry" value={dncRows.length} helper="Compliance records" accent="slate" icon={<BellIcon />} />
        <KpiCard label="Assignment Events" value={history.length} helper="Ledger activity" accent="teal" icon={<CalendarIcon />} />
      </div>

      {message ? <div className="info-banner">{message}</div> : null}

      <div className="admin-layout-grid">
        <aside className="glass-panel admin-sidebar-panel">
          <div className="admin-sidebar-tabs">
            {SECTIONS.map(([id, label, Icon]) => (
              <button key={id} type="button" className={`admin-sidebar-tab${activeSection === id ? ' active' : ''}`} onClick={() => setActiveSection(id)}>
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="glass-panel admin-content-panel">
          {activeSection === 'access' ? (
            <div className="admin-section-grid">
              <article className="admin-card wide">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow-label">Access Provisioning</span>
                    <h2>User Directory</h2>
                    <p>Approve sign-ins and control the role assigned to each user record.</p>
                  </div>
                </div>
                <div className="stack-list">
                  {pendingRequests.length ? pendingRequests.map((request) => (
                    <article key={request.id} className="admin-list-card">
                      <div>
                        <strong>{request.email}</strong>
                        <p>Requested {new Date(request.requested_at).toLocaleString()}</p>
                      </div>
                      <div className="table-action-row">
                        {ROLES.map((role) => <button key={role} type="button" className="table-action" onClick={() => handleApprove(request, role)}>{role}</button>)}
                        <button type="button" className="table-action ghost" onClick={() => rejectAccessRequest(request)}>Reject</button>
                      </div>
                    </article>
                  )) : <div className="empty-inline-card"><ShieldIcon /><p>No access approvals are waiting right now.</p></div>}
                </div>
                <div className="table-shell top-gap">
                  <table className="territory-table">
                    <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Channel</th></tr></thead>
                    <tbody>
                      {users.map((entry) => (
                        <tr key={entry.user_id}>
                          <td><strong>{entry.email}</strong><small>{entry.is_pioneer ? 'Pioneer' : 'Standard publisher'}</small></td>
                          <td><select value={entry.role} onChange={(event) => handleRoleUpdate(entry.user_id, event.target.value)}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></td>
                          <td><span className={`status-pill ${entry.is_approved === false ? 'warning' : 'success'}`}>{entry.is_approved === false ? 'Pending' : 'Approved'}</span></td>
                          <td>{entry.preferred_notification_method || 'email'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === 'geo' ? (
            <div className="admin-section-grid">
              <article className="admin-card wide">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow-label">Geospatial Management</span>
                    <h2>Boundary Controls</h2>
                    <p>Inspect live polygons, enabled state, and the current strategy assignment.</p>
                  </div>
                </div>
                <div className="geo-toolbar">
                  <select value={selectedGeoId} onChange={(event) => setSelectedGeoId(event.target.value)}>
                    {territories.map((territory) => <option key={territory.id} value={territory.id}>Territory {territory.territoryNo} • {territory.locality || territory.city || 'Unknown locality'}</option>)}
                  </select>
                  <label className="toggle-inline"><input type="checkbox" checked={Boolean(selectedGeoTerritory?.is_enabled)} onChange={(event) => handleTerritoryPatch({ is_enabled: event.target.checked })} /><span>Enabled</span></label>
                  <select value={selectedGeoTerritory?.territory_state || ''} onChange={(event) => handleTerritoryPatch({ territory_state: event.target.value || null })}>{STATES.map((state) => <option key={state || 'unset'} value={state}>{state || 'Unset state'}</option>)}</select>
                </div>
                <div className="geo-stage">
                  <div className="geo-map-frame">
                    <PremiumMapCanvas territories={territories} projected={projected} selectedId={selectedGeoId} onSelect={setSelectedGeoId} focusOnly dimOthers={false} zoomLevel={1.18} />
                  </div>
                  <div className="geo-side-stats">
                    <div className="metric-card"><span>Locality</span><strong>{territoryLocation(selectedGeoTerritory)}</strong></div>
                    <div className="metric-card"><span>Addresses</span><strong>{selectedGeoTerritory?.addresses?.length ?? 0}</strong></div>
                    <div className="metric-card"><span>Status</span><strong className={`status-pill inline ${toneForTerritoryState(selectedGeoTerritory?.territory_state || 'Initial Call')}`}>{selectedGeoTerritory?.territory_state || 'Initial Call'}</strong></div>
                  </div>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === 'compliance' ? (
            <div className="admin-section-grid">
              <article className="admin-card wide">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow-label">Compliance Registry</span>
                    <h2>Verified Do Not Call List</h2>
                    <p>Review and verify restricted addresses before they are printed.</p>
                  </div>
                </div>
                <div className="table-shell">
                  <table className="territory-table">
                    <thead><tr><th>Address</th><th>Territory</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {dncRows.length ? dncRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.address}</td>
                          <td>{row.territory_id}</td>
                          <td><span className={`status-pill ${row.is_verified ? 'danger' : 'warning'}`}>{row.is_verified ? 'Verified' : 'Pending'}</span></td>
                          <td><button type="button" className="table-action" onClick={() => verifyDnc(row.id, !row.is_verified)}>{row.is_verified ? 'Unverify' : 'Verify'}</button></td>
                        </tr>
                      )) : <tr><td colSpan="4"><div className="empty-inline-card"><BellIcon /><p>No do-not-call rows have been recorded yet.</p></div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === 'enrichment' ? (
            <div className="admin-section-grid">
              <article className="admin-card">
                <div className="section-heading"><div><span className="eyebrow-label">Data Enrichment</span><h2>Pipeline Health</h2><p>Track duplicate ownership, geocodes, and boundary cleanup.</p></div></div>
                <div className="stack-list">
                  <div className="metric-card"><span>Duplicate Queue</span><strong>{reviewQueues.phoneConflicts?.length || 0}</strong><div className="progress-track"><span style={{ width: `${Math.min((reviewQueues.phoneConflicts?.length || 0) * 8, 100)}%` }} /></div></div>
                  <div className="metric-card"><span>Geocode Queue</span><strong>{reviewQueues.geocodeFailures?.length || 0}</strong><div className="progress-track"><span style={{ width: `${Math.min((reviewQueues.geocodeFailures?.length || 0) * 8, 100)}%` }} /></div></div>
                  <div className="metric-card"><span>Boundary Queue</span><strong>{reviewQueues.outOfBoundary?.length || 0}</strong><div className="progress-track"><span style={{ width: `${Math.min((reviewQueues.outOfBoundary?.length || 0) * 8, 100)}%` }} /></div></div>
                </div>
              </article>
              <article className="admin-card wide">
                <div className="tab-strip"><button type="button" className={reviewTab === 'phoneConflicts' ? 'active' : ''} onClick={() => setReviewTab('phoneConflicts')}>Conflicts</button><button type="button" className={reviewTab === 'geocodeFailures' ? 'active' : ''} onClick={() => setReviewTab('geocodeFailures')}>Geocodes</button><button type="button" className={reviewTab === 'outOfBoundary' ? 'active' : ''} onClick={() => setReviewTab('outOfBoundary')}>Boundary</button></div>
                <div className="review-grid">
                  <div className="review-list">{currentReviewItems.map((item) => <button key={item.resolutionKey} type="button" className={`review-item${selectedReviewKey === item.resolutionKey ? ' active' : ''}`} onClick={() => setSelectedReviewKey(item.resolutionKey)}><strong>{item.address || item.issue}</strong><p>{item.issue}</p></button>)}</div>
                  <div className="review-detail">{selectedReviewItem ? <><h3>{selectedReviewItem.issue}</h3><p>{selectedReviewItem.address || selectedReviewItem.entries?.map((entry) => entry.address).join(' • ')}</p><textarea rows="6" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Resolution notes" /><div className="table-action-row"><button type="button" className="table-action" onClick={() => handleResolveReview(true)}>Resolve</button><button type="button" className="table-action ghost" onClick={() => handleResolveReview(false)}>Reopen</button><button type="button" className="table-action ghost" onClick={handleCreateReviewDnc}>Create Verified DNC</button></div></> : <div className="empty-inline-card"><DatabaseIcon /><p>Select a review item to resolve it.</p></div>}</div>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === 'ministry' ? (
            <div className="admin-section-grid">
              <article className="admin-card wide">
                <div className="section-heading"><div><span className="eyebrow-label">Ministry Orchestration</span><h2>Scheduling & Service Windows</h2><p>Coordinate CO visit windows, telephone restrictions, and the active operating range.</p></div></div>
                <form className="settings-grid" onSubmit={handleSaveSettings}>
                  <label className="toggle-inline wide"><input type="checkbox" checked={Boolean(serviceForm.coVisitModeEnabled)} onChange={(event) => setServiceForm((current) => ({ ...current, coVisitModeEnabled: event.target.checked }))} /><span>CO Visit mode</span></label>
                  <label><span>CO Visit Start</span><input type="date" value={serviceForm.coVisitStart || ''} onChange={(event) => setServiceForm((current) => ({ ...current, coVisitStart: event.target.value }))} /></label>
                  <label><span>CO Visit End</span><input type="date" value={serviceForm.coVisitEnd || ''} onChange={(event) => setServiceForm((current) => ({ ...current, coVisitEnd: event.target.value }))} /></label>
                  <label className="toggle-inline wide"><input type="checkbox" checked={Boolean(serviceForm.coRestrictTelephone)} onChange={(event) => setServiceForm((current) => ({ ...current, coRestrictTelephone: event.target.checked }))} /><span>Restrict telephone witnessing during CO visit</span></label>
                  <label><span>Telephone Start</span><input type="time" value={serviceForm.telephoneWindowStart || ''} onChange={(event) => setServiceForm((current) => ({ ...current, telephoneWindowStart: event.target.value }))} /></label>
                  <label><span>Telephone End</span><input type="time" value={serviceForm.telephoneWindowEnd || ''} onChange={(event) => setServiceForm((current) => ({ ...current, telephoneWindowEnd: event.target.value }))} /></label>
                  <button type="submit" className="primary-action">Save Orchestration</button>
                </form>
              </article>
            </div>
          ) : null}

          {activeSection === 'campaigns' ? (
            <div className="admin-section-grid">
              <article className="admin-card">
                <div className="section-heading"><div><span className="eyebrow-label">Campaign Management</span><h2>Create Campaign</h2><p>Launch focused ministry drives with explicit start and end dates.</p></div></div>
                <form className="settings-grid" onSubmit={handleCampaignSubmit}>
                  <label><span>Name</span><input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} required /></label>
                  <label><span>Start Date</span><input type="date" value={campaignForm.start_date} onChange={(event) => setCampaignForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
                  <label><span>End Date</span><input type="date" value={campaignForm.end_date} onChange={(event) => setCampaignForm((current) => ({ ...current, end_date: event.target.value }))} /></label>
                  <label className="toggle-inline wide"><input type="checkbox" checked={campaignForm.defaultEnabledToInitialCalls} onChange={(event) => setCampaignForm((current) => ({ ...current, defaultEnabledToInitialCalls: event.target.checked }))} /><span>Default enabled territories to Initial Call</span></label>
                  <button type="submit" className="primary-action" disabled={busy}>Launch Campaign</button>
                </form>
              </article>
              <article className="admin-card wide">
                <div className="section-heading"><div><span className="eyebrow-label">Campaign Registry</span><h2>Live Campaigns</h2><p>Toggle current campaigns without leaving the admin shell.</p></div></div>
                <div className="stack-list">{campaigns.length ? campaigns.map((campaign) => <article key={campaign.id} className="admin-list-card"><div><strong>{campaign.name}</strong><p>{campaign.start_date}{campaign.end_date ? ` • ${campaign.end_date}` : ''}</p></div><div className="table-action-row"><span className={`status-pill ${campaign.is_active ? 'success' : 'muted'}`}>{campaign.is_active ? 'Active' : 'Inactive'}</span><button type="button" className="table-action" onClick={() => toggleCampaign(campaign)}>{campaign.is_active ? 'Pause' : 'Activate'}</button></div></article>) : <div className="empty-inline-card"><SparklesIcon /><p>No campaigns have been created yet.</p></div>}</div>
              </article>
            </div>
          ) : null}

          {activeSection === 'documents' ? (
            <div className="admin-section-grid">
              <article className="admin-card wide">
                <div className="section-heading"><div><span className="eyebrow-label">Document Engine</span><h2>Production PDF Exports</h2><p>Generate S-12 cards, S-13 master forms, and the atlas printout directly from live data.</p></div></div>
                <div className="document-toolbar"><select value={exportScope} onChange={(event) => setExportScope(event.target.value)}><option value="all">All territories</option><option value="single">Single territory</option></select><select value={selectedExportId} onChange={(event) => setSelectedExportId(event.target.value)} disabled={exportScope !== 'single'}><option value="">Select territory</option>{territories.map((territory) => <option key={territory.id} value={String(territory.territoryNo ?? territory.id)}>Territory {territory.territoryNo} • {territory.locality || territory.city || 'Unknown locality'}</option>)}</select></div>
                <div className="document-grid">
                  <article className="document-card"><FileIcon /><h3>Generate S-12</h3><p>Territory cards with verified DNC back pages.</p><button type="button" className="primary-action" onClick={() => buildExport('s12')} disabled={busyExportKey === 's12'}>{busyExportKey === 's12' ? 'Building...' : 'Export S-12'}</button></article>
                  <article className="document-card"><FileIcon /><h3>Generate S-13</h3><p>Master assignment ledger using the official template.</p><button type="button" className="primary-action" onClick={() => buildExport('s13')} disabled={busyExportKey === 's13'}>{busyExportKey === 's13' ? 'Building...' : 'Export S-13'}</button></article>
                  <article className="document-card"><AtlasIcon /><h3>Generate Atlas</h3><p>Printable atlas overview for conductors and service meetings.</p><button type="button" className="primary-action" onClick={() => buildExport('atlas')} disabled={busyExportKey === 'atlas'}>{busyExportKey === 'atlas' ? 'Building...' : 'Export Atlas'}</button></article>
                </div>
              </article>
            </div>
          ) : null}

          {activeSection === 'config' ? (
            <div className="admin-section-grid">
              <article className="admin-card wide">
                <div className="section-heading"><div><span className="eyebrow-label">System Configuration</span><h2>Operating Defaults</h2><p>Control service windows, notifications, and fallback delivery behavior.</p></div></div>
                <form className="settings-grid" onSubmit={handleSaveSettings}>
                  <label className="toggle-inline wide"><input type="checkbox" checked={Boolean(serviceForm.telephoneWitnessingEnabled)} onChange={(event) => setServiceForm((current) => ({ ...current, telephoneWitnessingEnabled: event.target.checked }))} /><span>Telephone Witnessing Enabled</span></label>
                  <label><span>Telephone Start</span><input type="time" value={serviceForm.telephoneWindowStart || ''} onChange={(event) => setServiceForm((current) => ({ ...current, telephoneWindowStart: event.target.value }))} /></label>
                  <label><span>Telephone End</span><input type="time" value={serviceForm.telephoneWindowEnd || ''} onChange={(event) => setServiceForm((current) => ({ ...current, telephoneWindowEnd: event.target.value }))} /></label>
                  <label className="toggle-inline wide"><input type="checkbox" checked={Boolean(serviceForm.letterWritingEnabled)} onChange={(event) => setServiceForm((current) => ({ ...current, letterWritingEnabled: event.target.checked }))} /><span>Letter Writing Enabled</span></label>
                  <label><span>Letter Start</span><input type="time" value={serviceForm.letterWritingWindowStart || ''} onChange={(event) => setServiceForm((current) => ({ ...current, letterWritingWindowStart: event.target.value }))} /></label>
                  <label><span>Letter End</span><input type="time" value={serviceForm.letterWritingWindowEnd || ''} onChange={(event) => setServiceForm((current) => ({ ...current, letterWritingWindowEnd: event.target.value }))} /></label>
                  <label className="toggle-inline wide"><input type="checkbox" checked={Boolean(serviceForm.emailToTextFallbackEnabled)} onChange={(event) => setServiceForm((current) => ({ ...current, emailToTextFallbackEnabled: event.target.checked }))} /><span>Email-to-text fallback enabled</span></label>
                  <label className="toggle-inline wide"><input type="checkbox" checked={Boolean(serviceForm.disableFailingGateways)} onChange={(event) => setServiceForm((current) => ({ ...current, disableFailingGateways: event.target.checked }))} /><span>Disable failing gateways automatically</span></label>
                  <button type="submit" className="primary-action">Save Configuration</button>
                </form>
              </article>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
