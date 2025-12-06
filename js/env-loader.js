// /js/env-loader.js
// Safely load Supabase env from /api/env.js when available.
// If running from a static server (e.g., plain localhost) and /api/env.js serves
// the serverless handler source (with "export default function"), this avoids
// executing invalid syntax in the browser.
(async function loadSupabaseEnv() {
  try {
    const res = await fetch('/api/env.js', { cache: 'no-store' });
    if (!res.ok) throw new Error(`env.js not reachable (${res.status})`);

    const text = await res.text();

    // Extract only the assignment (avoid injecting "export default function" from serverless source)
    const match = text.match(/window\.__SUPABASE\s*=\s*\{[\s\S]*?\};/);
    if (!match) {
      console.warn('env-loader: env.js does not contain window.__SUPABASE assignment; skipping injection');
      return;
    }

    const payload = match[0];
    const blob = new Blob([payload], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    const script = document.createElement('script');
    script.src = url;
    script.onload = () => URL.revokeObjectURL(url);
    script.onerror = () => console.warn('env-loader: failed to inject env.js payload');
    document.head.appendChild(script);
  } catch (err) {
    console.warn('env-loader: unable to load /api/env.js; using local setup instead', err);
  }
})();
