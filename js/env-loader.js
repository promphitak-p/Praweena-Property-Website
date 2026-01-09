// /js/env-loader.js
// Safely load Supabase env from /api/env.js when available.
// If running from a static server (e.g., plain localhost) and /api/env.js serves
// the serverless handler source (with "export default function"), this avoids
// executing invalid syntax in the browser.

// /js/env-loader.js
(function loadSupabaseEnvSync() {
  try {
    const xhr = new XMLHttpRequest();
    const cacheBuster = `v=${Date.now()}`;
    // Synchronous request to ensure config is loaded before other scripts run
    xhr.open('GET', `/api/env.js?${cacheBuster}`, false);
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.send(null);

    if (xhr.status === 200) {
      const text = xhr.responseText || '';
      // Try parse JSON (new format)
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.url && parsed.anonKey) {
          window.__SUPABASE = window.__SUPABASE || {};
          window.__SUPABASE.url = parsed.url;
          window.__SUPABASE.anonKey = parsed.anonKey;
          console.log('env-loader: injected remote env (json)');
          return;
        }
      } catch (e) {
        // ignore parse error, fallback below
      }

      // Legacy fallback: look for assignment snippet
      const match = text.match(/window\.__SUPABASE\s*=\s*\{[\s\S]*?\};/);
      if (match) {
        // eslint-disable-next-line no-new-func
        new Function(match[0])();
        console.log('env-loader: injected remote env (legacy)');
      }
    } else {
      console.warn('env-loader: /api/env.js returned status ' + xhr.status);
    }
  } catch (err) {
    console.warn('env-loader: synchronous load failed (offline or blocked?)', err);
  }
})();
