// js/local-setup.js
(function () {
  // Only run if window.__SUPABASE is not already fully populated (e.g. by api/env.js)
  // and we are likely in a local environment (or the API failed).
  const w = window;
  w.__SUPABASE = w.__SUPABASE || {};

  const hostname = (w.location && w.location.hostname) || '';
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');

  console.log('[Local Setup] Checking for Supabase credentials...');

  // Try to load from localStorage
  const localUrl = localStorage.getItem('SUPABASE_URL');
  const localAnon = localStorage.getItem('SUPABASE_ANON_KEY');

  if (localUrl && localAnon) {
    w.__SUPABASE.url = localUrl;
    w.__SUPABASE.anonKey = localAnon;
    console.log('[Local Setup] ✓ Loaded Supabase config from localStorage');
    return;
  }

  // Validate loaded config (check for invalid placeholders from static file parsing)
  const isValid = (val) => val && val !== 'undefined' && val !== 'null' && !val.includes('${');

  if (w.__SUPABASE.url && !isValid(w.__SUPABASE.url)) w.__SUPABASE.url = '';
  if (w.__SUPABASE.anonKey && !isValid(w.__SUPABASE.anonKey)) w.__SUPABASE.anonKey = '';

  // If we have valid config from server, save it to local for future convenience
  if (w.__SUPABASE.url && w.__SUPABASE.anonKey) {
    console.log('[Local Setup] ✓ Supabase config loaded from server');
    // cache valid server config to local
    localStorage.setItem('SUPABASE_URL', w.__SUPABASE.url);
    localStorage.setItem('SUPABASE_ANON_KEY', w.__SUPABASE.anonKey);
    return;
  }

  // If not local environment, do not show modal (avoid blocking production users)
  if (!isLocalHost) {
    console.warn('[Local Setup] Missing Supabase config but not on localhost; skipping modal.');
    return;
  }

  console.log('[Local Setup] ✗ No credentials found. Will show setup modal.');

  // Function to create and show the modal
  function showSetupModal() {
    // Check again in case another script populated it
    if (w.__SUPABASE.url && w.__SUPABASE.anonKey) {
      console.log('[Local Setup] Config now available, skipping modal');
      return;
    }

    // Check if modal already exists
    if (document.getElementById('local-setup-modal')) {
      console.log('[Local Setup] Modal already exists');
      return;
    }

    console.log('[Local Setup] Creating setup modal...');

    const modal = document.createElement('div');
    modal.id = 'local-setup-modal';
    Object.assign(modal.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '99999',
      fontFamily: 'system-ui, sans-serif'
    });

    modal.innerHTML = `
      <div style="background:white; padding:2rem; border-radius:12px; max-width:400px; width:90%; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
        <h2 style="margin-top:0; color:#111;">Local Setup Required</h2>
        <p style="color:#666; font-size:0.95rem; line-height:1.5;">
          Running locally? Please provide your Supabase credentials to connect to the database.
        </p>
        <form id="local-setup-form" style="display:flex; flex-direction:column; gap:1rem; margin-top:1.5rem;">
          <div>
            <label style="display:block; font-weight:600; font-size:0.9rem; margin-bottom:0.5rem;">Supabase URL</label>
            <input type="text" name="url" required placeholder="https://xyz.supabase.co" style="width:100%; padding:0.75rem; border:1px solid #ddd; border-radius:6px;">
          </div>
          <div>
            <label style="display:block; font-weight:600; font-size:0.9rem; margin-bottom:0.5rem;">Anon Key</label>
            <input type="text" name="anon" required placeholder="eyJhbG..." style="width:100%; padding:0.75rem; border:1px solid #ddd; border-radius:6px;">
          </div>
          <button type="submit" style="background:#2563eb; color:white; border:none; padding:0.85rem; border-radius:6px; font-weight:600; cursor:pointer; margin-top:0.5rem;">
            Save & Reload
          </button>
        </form>
        <p style="margin-top:1rem; font-size:0.8rem; color:#999; text-align:center;">
          These keys will be saved to your browser's LocalStorage.
        </p>
      </div>
    `;

    document.body.appendChild(modal);
    console.log('[Local Setup] ✓ Modal added to DOM');

    const form = modal.querySelector('#local-setup-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = form.url.value.trim();
      const anon = form.anon.value.trim();
      if (url && anon) {
        console.log('[Local Setup] Saving credentials to localStorage...');
        localStorage.setItem('SUPABASE_URL', url);
        localStorage.setItem('SUPABASE_ANON_KEY', anon);
        window.location.reload();
      }
    });
  }

  // If we are here, we are missing config. Show the setup modal.
  // Try to show immediately if DOM is ready, otherwise wait for DOMContentLoaded
  if (document.readyState === 'loading') {
    console.log('[Local Setup] DOM still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', showSetupModal);
  } else {
    console.log('[Local Setup] DOM already ready, showing modal immediately');
    // DOM is already ready, show modal immediately
    showSetupModal();
  }
})();
