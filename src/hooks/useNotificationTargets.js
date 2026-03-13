import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  getNotificationTargets,
  removeNotificationTarget,
  saveNotificationTargets,
  upsertNotificationTarget
} from '../utils/notificationTargets';

export function useNotificationTargets() {
  const [targets, setTargets] = useState([]);
  const [source, setSource] = useState('local');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notification_targets')
        .select('*')
        .order('active', { ascending: false })
        .order('label', { ascending: true });
      if (error) throw error;
      setTargets(data || []);
      setSource('supabase');
    } catch {
      setTargets(getNotificationTargets());
      setSource('local');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeTargets = useMemo(() => targets.filter((item) => item.active), [targets]);

  const saveTarget = useCallback(async (target) => {
    setBusy(true);
    try {
      const payload = {
        ...target,
        updated_at: new Date().toISOString()
      };
      if (!payload.id) delete payload.id;
      const { data, error } = await supabase
        .from('notification_targets')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      setTargets((current) => {
        const exists = current.some((item) => item.id === data.id);
        return exists ? current.map((item) => (item.id === data.id ? data : item)) : [data, ...current];
      });
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch {
      const next = upsertNotificationTarget(target);
      setTargets(next);
      setSource('local');
      return { ok: false, source: 'local' };
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteTarget = useCallback(async (id) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('notification_targets').delete().eq('id', id);
      if (error) throw error;
      setTargets((current) => current.filter((item) => item.id !== id));
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch {
      const next = removeNotificationTarget(id);
      setTargets(next);
      setSource('local');
      return { ok: false, source: 'local' };
    } finally {
      setBusy(false);
    }
  }, []);

  const replaceTargets = useCallback(async (nextTargets) => {
    setBusy(true);
    try {
      const payload = nextTargets.map((item) => ({ ...item, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('notification_targets').upsert(payload);
      if (error) throw error;
      setTargets(payload);
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch {
      const next = saveNotificationTargets(nextTargets);
      setTargets(next);
      setSource('local');
      return { ok: false, source: 'local' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { targets, activeTargets, source, busy, refresh: load, saveTarget, deleteTarget, replaceTargets };
}
