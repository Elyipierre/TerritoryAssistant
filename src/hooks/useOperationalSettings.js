import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOperationalSettings, saveOperationalSettings } from '../utils/localOps';

function toMinutes(value = '00:00') {
  const [hours, minutes] = String(value).split(':').map((part) => Number(part || 0));
  return (hours * 60) + minutes;
}

function inDateWindow(start, end, now = new Date()) {
  if (!start || !end) return false;
  const current = new Date(now);
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  return current >= from && current <= to;
}

export function isWindowOpen(start, end, now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === to) return true;
  if (from < to) return current >= from && current <= to;
  return current >= from || current <= to;
}

export function useOperationalSettings() {
  const [settings, setSettings] = useState(getOperationalSettings());
  const [source, setSource] = useState('local');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('operational_settings').select('*').maybeSingle();
      if (error) throw error;
      if (data) {
        const merged = { ...getOperationalSettings(), ...data };
        setSettings(merged);
        setSource('supabase');
      } else {
        setSettings(getOperationalSettings());
        setSource('local');
      }
    } catch {
      setSettings(getOperationalSettings());
      setSource('local');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch) => {
    const next = saveOperationalSettings(patch);
    setSettings(next);
    try {
      const { error } = await supabase.from('operational_settings').upsert({ id: 1, ...next });
      if (error) throw error;
      setSource('supabase');
      return { ok: true, source: 'supabase' };
    } catch (error) {
      setSource('local');
      return { ok: false, error, source: 'local' };
    }
  }, []);

  const coVisitActive = Boolean(settings.coVisitModeEnabled) && inDateWindow(settings.coVisitStart, settings.coVisitEnd);

  const serviceWindowState = {
    telephone: settings.telephoneWitnessingEnabled && isWindowOpen(settings.telephoneWindowStart, settings.telephoneWindowEnd) && !(coVisitActive && settings.coRestrictTelephone),
    letter: settings.letterWritingEnabled && isWindowOpen(settings.letterWritingWindowStart, settings.letterWritingWindowEnd),
    coVisitActive
  };

  return { settings, save, source, loading, serviceWindowState, refresh: load };
}
