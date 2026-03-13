(function () {
  const SUPABASE_URL = 'https://dlncebwzunuxouyxteir.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJk bG5jZWJ3enVudXhvdXl4dGVpciIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcyODQ0NTc4LCJleHAiOjIwODg0MjA1Nzh9.WyM45C1Co_XmG-p_g793p3mImAIHqVWRpdxGer_95qQ'.replace(/\s+/g,'');
  const redirectTo = window.location.origin + '/app';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.appConfig = {
    supabase,
    signInWithGoogle: async function () {
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    }
  };
})();
