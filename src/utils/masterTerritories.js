let masterPromise = null;

function normalizeTerritories(data) {
  if (!data || !Array.isArray(data.territories)) return [];
  return data.territories.map((territory) => ({
    ...territory,
    is_enabled: territory.is_enabled ?? false,
    territory_state: territory.territory_state ?? null,
    source: territory.source ?? "master"
  }));
}

export async function loadMasterTerritories() {
  if (!masterPromise) {
    masterPromise = fetch('/data/territories.master.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load master territories: ${response.status}`);
        return response.json();
      })
      .then(normalizeTerritories)
      .catch((error) => {
        masterPromise = null;
        throw error;
      });
  }
  return masterPromise;
}

export function clearMasterTerritoriesCache() {
  masterPromise = null;
}
