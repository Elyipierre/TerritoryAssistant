import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'territory-assistant-user-directory';

function readLocal() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function useUserDirectory() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('supabase');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('user_roles')
        .select('user_id, email, role, full_name, display_name, is_approved')
        .order('role', { ascending: true });
      if (fetchError) throw fetchError;
      setUsers(data || []);
      writeLocal(data || []);
      setSource('supabase');
    } catch (err) {
      setError(err);
      setUsers(readLocal());
      setSource('local');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { users, loading, error, source, refresh: load };
}
