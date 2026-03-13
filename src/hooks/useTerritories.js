import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { projectTerritories, summarizeTerritories } from '../utils/territoryMap';
import { loadMasterTerritories } from '../utils/masterTerritories';

export function useTerritories({ enabledOnly = false } = {}) {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('loading');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('territories')
        .select('id, territoryNo, locality, city, state, zip, polygon, is_enabled, territory_state, addresses, labelAnchor, lastFetchedAt')
        .order('territoryNo', { ascending: true });

      if (enabledOnly) query = query.eq('is_enabled', true);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      if (Array.isArray(data) && data.length) {
        setTerritories(data);
        setSource('supabase');
      } else {
        const master = await loadMasterTerritories();
        const fallback = enabledOnly ? master.filter((territory) => territory.is_enabled) : master;
        setTerritories(fallback);
        setSource('master');
      }
    } catch (err) {
      setError(err);
      try {
        const master = await loadMasterTerritories();
        const fallback = enabledOnly ? master.filter((territory) => territory.is_enabled) : master;
        setTerritories(fallback);
        setSource('master');
      } catch (masterError) {
        setTerritories([]);
        setSource('error');
        setError(masterError);
      }
    } finally {
      setLoading(false);
    }
  }, [enabledOnly]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => { alive = false; };
  }, [load]);

  const projected = useMemo(() => projectTerritories(territories), [territories]);
  const summary = useMemo(() => summarizeTerritories(territories), [territories]);

  return { territories, projected, summary, loading, error, source, setTerritories, refresh: load };
}
