export function extractStreetName(address = "") {
  if (!address) return null;
  const firstSegment = String(address).split(',')[0]?.trim() ?? '';
  const withoutHouseNumber = firstSegment.replace(/^\d+[A-Z-]*\s+/i, '').trim();
  return withoutHouseNumber || firstSegment || null;
}

export function deriveStreetLabelsFromAddresses(addresses = [], limit = 4) {
  const counts = new Map();
  addresses.forEach((address) => {
    const full = typeof address === 'string' ? address : address?.full ?? '';
    const street = extractStreetName(full);
    if (!street) return;
    counts.set(street, (counts.get(street) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([street]) => street);
}

export function summarizeAddressLogs(logs = []) {
  return logs.reduce((acc, log) => {
    const code = log?.status_code || 'UNSET';
    acc.total += 1;
    acc.byCode[code] = (acc.byCode[code] || 0) + 1;
    if (code === 'DNC') acc.dnc += 1;
    return acc;
  }, { total: 0, dnc: 0, byCode: {} });
}

export function latestAddressStatuses(logs = []) {
  const map = new Map();
  [...logs]
    .sort((a, b) => new Date(b.logged_at || 0) - new Date(a.logged_at || 0))
    .forEach((log) => {
      if (!map.has(log.address)) map.set(log.address, log);
    });
  return map;
}

export function formatStatusLabel(code) {
  const labels = {
    CM: 'Contact Made',
    NA: 'Not At Home',
    NIS: 'Not Interested',
    VM: 'Voicemail',
    DNC: 'Do Not Call',
    NN: 'No Number',
    MVD: 'Moved',
    BUS: 'Business',
    OL: 'Other Language',
    UNSET: 'Unworked'
  };
  return labels[code] || code;
}
