import { useMemo } from 'react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import { useAssignments } from '../hooks/useAssignments';
import { useCampaignData } from '../hooks/useCampaignData';
import { useUserDirectory } from '../hooks/useUserDirectory';
import { buildOperationalAnalytics } from '../utils/operationalAnalytics';

function formatDays(value) {
  if (value == null) return 'N/A';
  return `${value.toFixed(1)}d`;
}

function formatDate(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleDateString();
}

export default function AnalyticsPage() {
  const { history, source: assignmentSource } = useAssignments(null, 'Admin');
  const { campaigns, territories, source: campaignSource } = useCampaignData({ role: 'Admin' });
  const { users, source: userSource } = useUserDirectory();

  const analytics = useMemo(
    () => buildOperationalAnalytics({ territories, history, campaigns, userDirectory: users }),
    [territories, history, campaigns, users]
  );

  const maxTrend = Math.max(1, ...analytics.assignmentTrend.map((row) => row.total));
  const maxBucket = Math.max(1, ...analytics.agingBuckets.map((row) => row.count));

  return (
    <AppShell title="Operational Analytics" subtitle="Track campaign activity, assignment velocity, and territory turnover from one operational view.">
      <div className="kpi-grid">
        <KpiCard label="Active Assignments" value={analytics.summary.activeAssignments} helper={`Assignments source: ${assignmentSource}`} />
        <KpiCard label="Completed Cycles" value={analytics.summary.completedCycles} helper="Selected → Completed" />
        <KpiCard label="Avg Completion" value={formatDays(analytics.summary.avgCompletionDays)} helper="Mean days from claim to complete" />
        <KpiCard label="Active Campaigns" value={analytics.summary.activeCampaigns} helper={`Campaign source: ${campaignSource}`} />
        <KpiCard label="Returned Cycles" value={analytics.summary.returnedCycles} helper="Selected → Returned" />
        <KpiCard label="Avg Return" value={formatDays(analytics.summary.avgReturnDays)} helper="Mean days from claim to return" />
        <KpiCard label="Tracked Territories" value={analytics.summary.totalTerritories} helper="Unified geographic layout" />
        <KpiCard label="Directory Rows" value={users.length} helper={`User source: ${userSource}`} />
      </div>

      <div className="grid-panels">
        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Assignment Velocity</h3>
              <p>Monthly movement across selections, completions, and returns for the last six months.</p>
            </div>
          </div>
          <div className="analytics-bars">
            {analytics.assignmentTrend.map((row) => (
              <div key={row.key} className="analytics-bar-row">
                <div className="analytics-bar-meta">
                  <strong>{row.label}</strong>
                  <p>{row.total} total actions</p>
                </div>
                <div className="analytics-bar-stack" aria-hidden="true">
                  <span className="analytics-segment selected" style={{ width: `${(row.selected / maxTrend) * 100}%` }} />
                  <span className="analytics-segment completed" style={{ width: `${(row.completed / maxTrend) * 100}%` }} />
                  <span className="analytics-segment returned" style={{ width: `${(row.returned / maxTrend) * 100}%` }} />
                </div>
                <div className="analytics-bar-legend">
                  <span>Selected {row.selected}</span>
                  <span>Completed {row.completed}</span>
                  <span>Returned {row.returned}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Territory Aging</h3>
              <p>Current active assignments grouped by days in the pool.</p>
            </div>
          </div>
          <div className="stack-list">
            {analytics.agingBuckets.map((row) => (
              <div key={row.label} className="stack-item compact analytics-stat-row">
                <div>
                  <strong>{row.label}</strong>
                  <p>{row.count} active territory{row.count === 1 ? '' : 'ies'}</p>
                </div>
                <div className="mini-progress"><span style={{ width: `${(row.count / maxBucket) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3>Campaign Snapshot</h3>
              <p>Live operational status across your campaigns.</p>
            </div>
          </div>
          <div className="stack-list">
            {analytics.campaignRows.slice(0, 6).map((campaign) => (
              <div key={campaign.id} className="stack-item compact">
                <strong>{campaign.name}</strong>
                <p>{campaign.status} • {formatDate(campaign.start_date)} → {campaign.end_date ? formatDate(campaign.end_date) : 'Open ended'}</p>
                <p className="muted-copy">Duration target: {campaign.daySpan != null ? `${campaign.daySpan} day(s)` : 'Not defined'}</p>
              </div>
            ))}
            {!analytics.campaignRows.length ? <p className="muted-copy">No campaigns created yet.</p> : null}
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Territory Turnover Leaderboard</h3>
              <p>See which territories are cycling most often and how quickly they are moving through the field.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Territory</th>
                  <th>Locality</th>
                  <th>Selections</th>
                  <th>Completed</th>
                  <th>Returned</th>
                  <th>Avg Completion</th>
                  <th>Active Aging</th>
                </tr>
              </thead>
              <tbody>
                {analytics.turnoverRows.slice(0, 15).map((row) => (
                  <tr key={row.territoryId}>
                    <td>{row.territoryNo}</td>
                    <td>{row.locality}</td>
                    <td>{row.selected}</td>
                    <td>{row.completed}</td>
                    <td>{row.returned}</td>
                    <td>{formatDays(row.avgCompletionDays)}</td>
                    <td>{row.active ? `${row.activeDays ?? 0}d active` : 'Not active'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel-card wide">
          <div className="panel-card-header">
            <div>
              <h3>Assignment Performance</h3>
              <p>Operational leaderboard based on assignment activity in the ledger.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Selected</th>
                  <th>Completed</th>
                  <th>Returned</th>
                </tr>
              </thead>
              <tbody>
                {analytics.userRows.slice(0, 12).map((row) => (
                  <tr key={row.userId}>
                    <td>{row.label}</td>
                    <td>{row.role}</td>
                    <td>{row.selected}</td>
                    <td>{row.completed}</td>
                    <td>{row.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!analytics.userRows.length ? <p className="muted-copy">No assignment ownership records yet.</p> : null}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
