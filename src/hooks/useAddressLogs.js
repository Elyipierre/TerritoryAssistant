import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { summarizeAddressLogs, latestAddressStatuses } from '../utils/addressing';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY = 'territory-assistant-address-logs';

function readLocalLogs() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalLogs(logs) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export function useAddressLogs(territoryId) {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(Boolean(territoryId));
  const [error, setError] = useState(null);
  const [source, setSource] = useState('supabase');

  const load = useCallback(async () => {
    if (!territoryId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('address_logs')
        .select('*')
        .eq('territory_id', territoryId)
        .order('logged_at', { ascending: false });
      if (fetchError) throw fetchError;
      setLogs(data ?? []);
      setSource('supabase');
    } catch (err) {
      setError(err);
      const local = readLocalLogs().filter((row) => row.territory_id === territoryId);
      setLogs(local);
      setSource('local');
    } finally {
      setLoading(false);
    }
  }, [territoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const createLog = useCallback(async ({ address, status_code, secondary_language = null }) => {
    const payload = {
      territory_id: territoryId,
      address,
      status_code,
      secondary_language,
      logged_by: user?.id ?? null,
      logged_at: new Date().toISOString()
    };

    try {
      const { data, error: insertError } = await supabase
        .from('address_logs')
        .insert(payload)
        .select('*')
        .single();
      if (insertError) throw insertError;

      setLogs((current) => [data, ...current]);
      setSource('supabase');

      if (status_code === 'DNC') {
        await supabase.from('do_not_calls').insert({
          territory_id: territoryId,
          address,
          flagged_by: user?.id ?? null,
          notes: 'Auto-synced from publisher workflow',
          is_verified: false
        });
      }
      return { ok: true };
    } catch (err) {
      const localLogs = readLocalLogs();
      const fallback = { id: crypto.randomUUID(), ...payload };
      localLogs.unshift(fallback);
      writeLocalLogs(localLogs);
      setLogs((current) => [fallback, ...current]);
      setSource('local');
      return { ok: false, error: err };
    }
  }, [territoryId, user?.id]);

  const summary = useMemo(() => summarizeAddressLogs(logs), [logs]);
  const latestByAddress = useMemo(() => latestAddressStatuses(logs), [logs]);

  return {
    logs,
    loading,
    error,
    source,
    summary,
    latestByAddress,
    createLog,
    refresh: load
  };
}
