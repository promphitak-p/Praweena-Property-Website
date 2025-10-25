(() => {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.warn("[init-supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  window.getSupabase = () => {
    if (!window.supabase?.createClient) {
      console.error("Supabase SDK not loaded");
      return null;
    }
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  };
})();
