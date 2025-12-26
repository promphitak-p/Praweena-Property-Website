// /js/env-loader.js
// Safely load Supabase env from /api/env.js when available.
// If running from a static server (e.g., plain localhost) and /api/env.js serves
// the serverless handler source (with "export default function"), this avoids
// executing invalid syntax in the browser.

// /js/env-loader.js
(function loadSupabaseEnvSync() {
  try {
    const xhr = new XMLHttpRequest();
    // Synchronous request to ensure config is loaded before other scripts run
    xhr.open('GET', '/api/env.js', false);
    xhr.send(null);

    if (xhr.status === 200) {
      const text = xhr.responseText;
      // Check if it's the executed assignment (Prod) or source code (Dev/Static)
      // We look for the specific pattern window.__SUPABASE = ...
      const match = text.match(/window\.__SUPABASE\s*=\s*\{[\s\S]*?\};/);

      if (match) {
        // Safe to execute because it matches our expected pattern
        // Using new Function is cleaner than eval for global scope execution
        // eslint-disable-next-line no-new-func
        new Function(match[0])();
        console.log('env-loader: injected remote env');
      } else {
        // This usually happens locally where /api/env.js returns the file source code
        // We silently ignore it and let local-setup.js or localStorage take over
        // console.debug('env-loader: /api/env.js did not return executable config (likely local dev)');
      }
    } else {
      console.warn('env-loader: /api/env.js returned status ' + xhr.status);
    }
  } catch (err) {
    console.warn('env-loader: synchronous load failed (offline or blocked?)', err);
  }
})();
