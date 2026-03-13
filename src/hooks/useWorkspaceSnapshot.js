import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadMasterTerritories } from '../utils/masterTerritories';
import { projectTerritories, summarizeTerritories } from '../utils/territoryMap';
import { buildAssignmentLedger } from '../utils/assignmentRules';

function emptyState() {
  return {
    territories: [],
    campaigns: [],
    assignments: [],
    users: [],
    addressLogs: [],
    dncRows: []
  };
}

export function useWorkspaceSnapshot() {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('supabase');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [territoryRes, campaignRes, assignmentRes, userRes, logRes, dncRes] = await Promise.all([
        supabase.from('territories').select('id, territoryNo, locality, city, state, zip, polygon, is_enabled, territory_state, addresses, labelAnchor, lastFetchedAt').order('territoryNo', { ascending: true }),
        supabase.from('campaigns').select('*').order('start_date', { ascending: false }),
        supabase.from('assignment_history').select('*').order('action_date', { ascending: false }).limit(500),
        supabase.from('user_roles').select('*').order('created_at', { ascending: false }),
        supabase.from('address_logs').select('*').order('logged_at', { ascending: false }).limit(1000),
        supabase.from('do_not_calls').select('*').order('created_at', { ascending: false }).limit(500)
      ]);

      const firstError = [
        territoryRes.error,
        campaignRes.error,
        assignmentRes.error,
        userRes.error,
        logRes.error,
        dncRes.error
      ].find(Boolean);

      if (firstError) throw firstError;

      setState({
        territories: territoryRes.data ?? [],
        campaigns: campaignRes.data ?? [],
        assignments: assignmentRes.data ?? [],
        users: userRes.data ?? [],
        addressLogs: logRes.data ?? [],
        dncRows: dncRes.data ?? []
      });
      setSource('supabase');
    } catch (fetchError) {
      const fallbackTerritories = await loadMasterTerritories().catch(() => []);
      setState({
        territories: fallbackTerritories,
        campaigns: [],
        assignments: [],
        users: [],
        addressLogs: [],
        dncRows: []
      });
      setSource('fallback');
      setError(fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projected = useMemo(() => projectTerritories(state.territories), [state.territories]);
  const summary = useMemo(() => summarizeTerritories(state.territories), [state.territories]);
  const ledger = useMemo(() => buildAssignmentLedger(state.assignments), [state.assignments]);

  const logsByTerritory = useMemo(() => {
    const map = new Map();
    state.addressLogs.forEach((row) => {
      const key = String(row.territory_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }, [state.addressLogs]);

  const metrics = useMemo(() => {
    const enabledCount = state.territories.filter((territory) => territory.is_enabled).length;
    const addressCount = state.territories.reduce((total, territory) => total + (territory.addresses?.length ?? 0), 0);
    const assignedCount = state.territories.filter((territory) => ledger.territoryMap.get(territory.id)?.isSelected).length;
    const completedCount = state.territories.filter((territory) => ledger.territoryMap.get(territory.id)?.isCompleted).length;
    const activeCampaignCount = state.campaigns.filter((campaign) => campaign.is_active).length;
    const approvedUserCount = state.users.filter((user) => user.is_approved !== false).length;

    return {
      enabledCount,
      addressCount,
      assignedCount,
      completedCount,
      activeCampaignCount,
      approvedUserCount,
      territoryCount: state.territories.length,
      assignmentCount: state.assignments.length,
      addressLogCount: state.addressLogs.length,
      dncCount: state.dncRows.length
    };
  }, [ledger.territoryMap, state.addressLogs.length, state.assignments.length, state.campaigns, state.dncRows.length, state.territories, state.users]);

  const territoryCards = useMemo(() => (
    state.territories.map((territory) => {
      const assignmentState = ledger.territoryMap.get(territory.id);
      const availability = !territory.is_enabled
        ? 'Disabled'
        : assignmentState?.isCompleted
          ? 'Completed'
          : assignmentState?.isSelected
            ? 'Assigned'
            : 'Available';
      const addressCount = territory.addresses?.length ?? 0;
      const logCount = logsByTerritory.get(String(territory.id))?.length ?? 0;
      return {
        ...territory,
        availability,
        addressCount,
        logCount,
        progressPercent: addressCount ? Math.min(100, Math.round((logCount / addressCount) * 100)) : 0
      };
    })
  ), [ledger.territoryMap, logsByTerritory, state.territories]);

  return {
    ...state,
    projected,
    summary,
    ledger,
    metrics,
    territoryCards,
    loading,
    error,
    source,
    refresh: load
  };
}
