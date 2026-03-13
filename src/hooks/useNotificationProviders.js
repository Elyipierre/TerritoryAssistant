import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  getNotificationProviders,
  removeNotificationProvider,
  saveNotificationProviders,
  upsertNotificationProvider
} from '../utils/notificationProviders';

export function useNotificationProviders() {
  const [providers, setProviders] = useState([]);
  const [source, setSource] = useState('local');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notification_providers')
        .select('*')
        .order('active', { ascending: false })
        .order('label', { ascending: true });
      if (error) throw error;
      setProviders(data || []);
      setSource('supabase');
    } catch {
      setProviders(getNotificationProviders());
      setSource('local');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeProviders = useMemo(() => providers.filter((item) => item.active), [providers]);

  const saveProvider = useCallback(async (provider) => {
    setBusy(true);
    try {
      const payload = {
        ...provider,
        updated_at: new Date().toISOString()
      };
      if (!payload.id) delete payload.id;
      const { data, error } = await supabase
        .from('notification_providers')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      setProviders((current) => {
        const exists = current.some((item) => item.id === data.id);
        return exists ? current.map((item) => (item.id === data.id ? data : item)) : [data, ...current];
      });
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch {
      const next = upsertNotificationProvider(provider);
      setProviders(next);
      setSource('local');
      return { ok: false, source: 'local' };
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteProvider = useCallback(async (id) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('notification_providers').delete().eq('id', id);
      if (error) throw error;
      setProviders((current) => current.filter((item) => item.id !== id));
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch {
      const next = removeNotificationProvider(id);
      setProviders(next);
      setSource('local');
      return { ok: false, source: 'local' };
    } finally {
      setBusy(false);
    }
  }, []);

  const replaceProviders = useCallback(async (nextProviders) => {
    setBusy(true);
    try {
      const payload = nextProviders.map((item) => ({ ...item, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('notification_providers').upsert(payload);
      if (error) throw error;
      setProviders(payload);
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch {
      const next = saveNotificationProviders(nextProviders);
      setProviders(next);
      setSource('local');
      return { ok: false, source: 'local' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { providers, activeProviders, source, busy, refresh: load, saveProvider, deleteProvider, replaceProviders };
}
