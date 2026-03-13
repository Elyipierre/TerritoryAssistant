import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildAssignmentLedger, validateAssignmentAction } from '../utils/assignmentRules';

const STORAGE_KEY = 'territory-assistant-assignment-history';

function readLocalHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalHistory(rows) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function sortByDateDesc(rows) {
  return [...rows].sort((a, b) => new Date(b.action_date || 0) - new Date(a.action_date || 0));
}

export function useAssignments(userId, role = 'Publisher') {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('supabase');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('assignment_history')
        .select('*')
        .order('action_date', { ascending: false });
      if (fetchError) throw fetchError;
      setHistory(data ?? []);
      setSource('supabase');
    } catch (err) {
      setError(err);
      setHistory(readLocalHistory());
      setSource('local');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ledger = useMemo(() => buildAssignmentLedger(history), [history]);

  const myAssignments = useMemo(() => {
    if (!userId) return { active: [], completed: [] };
    return ledger.userMap.get(userId) ?? { active: [], completed: [] };
  }, [ledger.userMap, userId]);

  const territoryStateFor = useCallback((territoryId) => ledger.territoryMap.get(territoryId) ?? {
    territoryId,
    selectedBy: null,
    selectedAt: null,
    completedBy: null,
    completedAt: null,
    lastCompletedBy: null,
    latestAction: null,
    isSelected: false,
    isCompleted: false
  }, [ledger.territoryMap]);

  const recordAction = useCallback(async ({ territoryId, action, publisherId }) => {
    const state = territoryStateFor(territoryId);
    const validation = validateAssignmentAction({ state, action, userId: publisherId, role });
    if (!validation.ok) return { ok: false, error: { message: validation.message }, validation };

    const optimistic = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      territory_id: territoryId,
      action,
      publisher_id: publisherId,
      action_date: new Date().toISOString()
    };

    setHistory((current) => sortByDateDesc([optimistic, ...current]));

    try {
      const { data, error: insertError } = await supabase
        .from('assignment_history')
        .insert({ territory_id: territoryId, action, publisher_id: publisherId })
        .select('*')
        .single();
      if (insertError) throw insertError;

      setHistory((current) => sortByDateDesc([data, ...current.filter((row) => row.id !== optimistic.id)]));
      setSource('supabase');
      return { ok: true, data };
    } catch (err) {
      const fallbackRow = { ...optimistic, id: crypto.randomUUID() };
      setHistory((current) => {
        const next = sortByDateDesc([fallbackRow, ...current.filter((row) => row.id !== optimistic.id)]);
        writeLocalHistory(next);
        return next;
      });
      setSource('local');
      return { ok: false, error: err, fallback: true };
    }
  }, [territoryStateFor, role]);

  const claimTerritory = useCallback((territoryId, publisherId) => recordAction({ territoryId, action: 'Selected', publisherId }), [recordAction]);
  const returnTerritory = useCallback((territoryId, publisherId) => recordAction({ territoryId, action: 'Returned', publisherId }), [recordAction]);
  const completeTerritory = useCallback((territoryId, publisherId) => recordAction({ territoryId, action: 'Completed', publisherId }), [recordAction]);

  return { history, loading, error, source, ledger, myAssignments, territoryStateFor, claimTerritory, returnTerritory, completeTerritory, refresh: load };
}
