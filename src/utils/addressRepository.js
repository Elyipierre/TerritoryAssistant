export function getAddressKey(address = {}) {
  return String(address.full || address.address || '').trim();
}

export function flattenTerritoryAddresses(territories = []) {
  const rows = [];
  territories.forEach((territory) => {
    const territoryKey = String(territory.territoryNo ?? territory.id ?? '');
    (territory.addresses || []).forEach((address, index) => {
      const key = getAddressKey(address) || `Unknown address ${index + 1}`;
      rows.push({
        territoryId: territory.id,
        territoryNo: territory.territoryNo,
        territoryKey,
        locality: territory.locality ?? territory.city ?? '',
        key,
        address,
        index,
      });
    });
  });
  return rows;
}

export function buildAddressIndex(territories = []) {
  const index = new Map();
  flattenTerritoryAddresses(territories).forEach((row) => {
    if (!index.has(row.key)) index.set(row.key, []);
    index.get(row.key).push(row);
  });
  return index;
}

export function updateAddressRecords(addresses = [], addressValue, updater) {
  return addresses.map((address) => {
    const key = getAddressKey(address);
    if (String(key) !== String(addressValue)) return { ...address };
    const updated = updater({ ...address }) ?? address;
    return { ...updated };
  });
}

export function removeAddressRecord(addresses = [], addressValue) {
  return addresses
    .filter((address) => String(getAddressKey(address)) !== String(addressValue))
    .map((address) => ({ ...address }));
}

export function summarizeAddressInventory(territories = []) {
  const rows = flattenTerritoryAddresses(territories);
  const reviewFlags = rows.filter((row) => row.address.review_status || row.address.suppressed).length;
  const suppressed = rows.filter((row) => row.address.suppressed).length;
  const manualReview = rows.filter((row) => row.address.review_status === 'manual_review').length;
  return {
    total: rows.length,
    reviewFlags,
    suppressed,
    manualReview,
  };
}
