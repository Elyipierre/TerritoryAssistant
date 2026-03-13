function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function territoryLabel(territory) {
  return territory?.territoryNo ?? territory?.id ?? 'Unknown';
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
}

export function buildOperationalAnalytics({ territories = [], history = [], campaigns = [], userDirectory = [] }) {
  const now = new Date();
  const territoryMap = new Map(territories.map((territory) => [territory.id, territory]));
  const userMap = new Map(userDirectory.map((user) => [user.user_id, user]));
  const ordered = [...history]
    .filter((row) => row?.territory_id && row?.action && row?.action_date)
    .sort((a, b) => new Date(a.action_date) - new Date(b.action_date));

  const agingBuckets = [
    { label: '0-30 Days', min: 0, max: 30, count: 0 },
    { label: '31-60 Days', min: 31, max: 60, count: 0 },
    { label: '61-90 Days', min: 61, max: 90, count: 0 },
    { label: '91-120 Days', min: 91, max: 120, count: 0 },
    { label: '120+ Days', min: 121, max: Infinity, count: 0 }
  ];

  const actionMonthMap = new Map();
  const territoryTurnover = new Map();
  const userPerformance = new Map();
  const openAssignments = new Map();
  let completedCycles = 0;
  let returnedCycles = 0;
  let totalCompletionDays = 0;
  let totalReturnDays = 0;

  for (let monthOffset = 5; monthOffset >= 0; monthOffset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    actionMonthMap.set(monthKey(date), { selected: 0, completed: 0, returned: 0 });
  }

  ordered.forEach((row) => {
    const actionDate = parseDate(row.action_date);
    if (!actionDate) return;

    const month = monthKey(actionDate);
    if (actionMonthMap.has(month)) {
      const bucket = actionMonthMap.get(month);
      if (row.action === 'Selected') bucket.selected += 1;
      if (row.action === 'Completed') bucket.completed += 1;
      if (row.action === 'Returned') bucket.returned += 1;
    }

    const territoryId = row.territory_id;
    const territory = territoryMap.get(territoryId);
    if (!territoryTurnover.has(territoryId)) {
      territoryTurnover.set(territoryId, {
        territoryId,
        territoryNo: territoryLabel(territory),
        locality: territory?.locality ?? territory?.city ?? 'Unknown locality',
        selected: 0,
        completed: 0,
        returned: 0,
        active: false,
        activeDays: null,
        avgCompletionDays: null,
        avgReturnDays: null,
        completionSamples: [],
        returnSamples: []
      });
    }
    const turnoverEntry = territoryTurnover.get(territoryId);

    if (row.publisher_id) {
      if (!userPerformance.has(row.publisher_id)) {
        const user = userMap.get(row.publisher_id);
        userPerformance.set(row.publisher_id, {
          userId: row.publisher_id,
          label: user?.full_name || user?.display_name || user?.email || row.publisher_id,
          role: user?.role || 'Unknown',
          selected: 0,
          completed: 0,
          returned: 0
        });
      }
    }
    const userEntry = row.publisher_id ? userPerformance.get(row.publisher_id) : null;

    if (row.action === 'Selected') {
      turnoverEntry.selected += 1;
      if (userEntry) userEntry.selected += 1;
      openAssignments.set(territoryId, { row, selectedAt: actionDate });
    }

    if (row.action === 'Completed') {
      turnoverEntry.completed += 1;
      if (userEntry) userEntry.completed += 1;
      const open = openAssignments.get(territoryId);
      if (open?.selectedAt) {
        const days = Math.max(0, Math.round((actionDate - open.selectedAt) / 86400000));
        totalCompletionDays += days;
        completedCycles += 1;
        turnoverEntry.completionSamples.push(days);
      }
      openAssignments.delete(territoryId);
    }

    if (row.action === 'Returned') {
      turnoverEntry.returned += 1;
      if (userEntry) userEntry.returned += 1;
      const open = openAssignments.get(territoryId);
      if (open?.selectedAt) {
        const days = Math.max(0, Math.round((actionDate - open.selectedAt) / 86400000));
        totalReturnDays += days;
        returnedCycles += 1;
        turnoverEntry.returnSamples.push(days);
      }
      openAssignments.delete(territoryId);
    }
  });

  territoryTurnover.forEach((entry, territoryId) => {
    entry.active = openAssignments.has(territoryId);
    if (entry.active) {
      const selectedAt = openAssignments.get(territoryId)?.selectedAt;
      entry.activeDays = selectedAt ? Math.max(0, Math.floor((now - selectedAt) / 86400000)) : null;
      if (entry.activeDays != null) {
        const bucket = agingBuckets.find((item) => entry.activeDays >= item.min && entry.activeDays <= item.max);
        if (bucket) bucket.count += 1;
      }
    }
    if (entry.completionSamples.length) {
      entry.avgCompletionDays = entry.completionSamples.reduce((sum, value) => sum + value, 0) / entry.completionSamples.length;
    }
    if (entry.returnSamples.length) {
      entry.avgReturnDays = entry.returnSamples.reduce((sum, value) => sum + value, 0) / entry.returnSamples.length;
    }
  });

  const assignmentTrend = [...actionMonthMap.entries()].map(([key, counts]) => ({
    key,
    label: monthLabel(key),
    ...counts,
    total: counts.selected + counts.completed + counts.returned
  }));

  const turnoverRows = [...territoryTurnover.values()]
    .sort((a, b) => {
      const aScore = (a.completed * 10) + a.selected;
      const bScore = (b.completed * 10) + b.selected;
      return bScore - aScore;
    });

  const userRows = [...userPerformance.values()]
    .sort((a, b) => ((b.completed * 10) + b.selected) - ((a.completed * 10) + a.selected));

  const campaignRows = campaigns.map((campaign) => {
    const start = parseDate(campaign.start_date);
    const end = parseDate(campaign.end_date);
    const isActive = Boolean(campaign.is_active);
    let daySpan = null;
    if (start && end) daySpan = Math.max(0, Math.round((end - start) / 86400000));
    return {
      ...campaign,
      daySpan,
      status: isActive ? 'Active' : 'Paused'
    };
  });

  const activeCampaigns = campaignRows.filter((campaign) => campaign.status === 'Active').length;

  const territoryTurnoverSummary = {
    totalTerritories: territories.length,
    activeAssignments: openAssignments.size,
    completedCycles,
    returnedCycles,
    avgCompletionDays: completedCycles ? totalCompletionDays / completedCycles : null,
    avgReturnDays: returnedCycles ? totalReturnDays / returnedCycles : null,
    activeCampaigns,
    totalCampaigns: campaignRows.length
  };

  return {
    summary: territoryTurnoverSummary,
    assignmentTrend,
    agingBuckets,
    turnoverRows,
    userRows,
    campaignRows
  };
}
