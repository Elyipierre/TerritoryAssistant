import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadMasterTerritories } from '../utils/masterTerritories';
import { buildAssignmentLedger, validateAssignmentAction } from '../utils/assignmentRules';

export function useCampaignData(actor = {}) {
  const [campaigns, setCampaigns] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('supabase');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignRes, territoryRes, historyRes] = await Promise.all([
        supabase.from('campaigns').select('*').order('start_date', { ascending: false }),
        supabase.from('territories').select('id, territoryNo, locality, is_enabled, territory_state, polygon, addresses, labelAnchor').order('territoryNo', { ascending: true }),
        supabase.from('assignment_history').select('id, territory_id, action, action_date, publisher_id').order('action_date', { ascending: false }).limit(500)
      ]);
      const firstError = [campaignRes.error, territoryRes.error, historyRes.error].find(Boolean);
      if (firstError) throw firstError;
      setCampaigns(campaignRes.data ?? []);
      setTerritories(territoryRes.data ?? []);
      setHistory(historyRes.data ?? []);
      setSource('supabase');
      setError(null);
    } catch (err) {
      setError(err);
      setTerritories(await loadMasterTerritories());
      setCampaigns([]);
      setHistory([]);
      setSource('master');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ledger = useMemo(() => buildAssignmentLedger(history), [history]);
  const completionMap = useMemo(() => ledger.territoryMap, [ledger]);

  const kpis = useMemo(() => {
    const enabled = territories.filter((territory) => territory.is_enabled).length;
    const completed = territories.filter((territory) => completionMap.get(territory.id)?.isCompleted).length;
    const total = territories.length;
    const remaining = Math.max(total - completed, 0);
    const progress = total ? Math.round((completed / total) * 100) : 0;
    return { total, enabled, completed, remaining, progress };
  }, [territories, completionMap]);

  async function recordAction(territoryId, publisherId, action) {
    const state = completionMap.get(territoryId) ?? {};
    const validation = validateAssignmentAction({ state, action, userId: publisherId, role: actor.role });
    if (!validation.ok) return { ok: false, error: { message: validation.message } };

    const optimistic = {
      id: `temp-${Date.now()}`,
      territory_id: territoryId,
      action,
      publisher_id: publisherId,
      action_date: new Date().toISOString()
    };
    setHistory((current) => [optimistic, ...current]);

    try {
      const { data, error: insertError } = await supabase
        .from('assignment_history')
        .insert({ territory_id: territoryId, publisher_id: publisherId, action })
        .select('*')
        .single();
      if (insertError) throw insertError;
      setHistory((current) => [data, ...current.filter((row) => row.id !== optimistic.id)]);
      return { ok: true };
    } catch (err) {
      setHistory((current) => current.filter((row) => row.id !== optimistic.id));
      return { ok: false, error: err };
    }
  }

  async function createCampaign(payload, options = {}) {
    setBusy(true);
    try {
      const insertPayload = {
        name: payload.name,
        start_date: payload.start_date,
        end_date: payload.end_date || null,
        is_active: payload.is_active ?? true
      };
      const { data, error: insertError } = await supabase.from('campaigns').insert(insertPayload).select('*').single();
      if (insertError) throw insertError;
      setCampaigns((current) => [data, ...current]);

      if (options.defaultEnabledToInitialCalls) {
        const enabledIds = territories.filter((territory) => territory.is_enabled).map((territory) => territory.id);
        if (enabledIds.length) {
          const { error: updateError } = await supabase.from('territories').update({ territory_state: 'Initial Call' }).in('id', enabledIds);
          if (!updateError) {
            setTerritories((current) => current.map((territory) => territory.is_enabled ? { ...territory, territory_state: 'Initial Call' } : territory));
          }
        }
      }

      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      setBusy(false);
    }
  }

  async function toggleCampaignActive(id, is_active) {
    setCampaigns((current) => current.map((campaign) => campaign.id === id ? { ...campaign, is_active } : campaign));
    const { error: updateError } = await supabase.from('campaigns').update({ is_active }).eq('id', id);
    if (updateError) {
      setCampaigns((current) => current.map((campaign) => campaign.id === id ? { ...campaign, is_active: !is_active } : campaign));
      return { ok: false, error: updateError };
    }
    return { ok: true };
  }

  return { campaigns, territories, history, kpis, loading, error, source, busy, completionMap, recordAction, createCampaign, toggleCampaignActive, refresh: load };
}
