/**
 * env-module.js
 * Asynchronous loader for environment variables.
 * Uses Top-Level Await pattern when imported by config.js
 */

export async function loadEnv() {
    // 1. Check if window.__SUPABASE is already set (e.g. by manual script)
    if (window.__SUPABASE?.url && window.__SUPABASE?.anonKey) {
        return window.__SUPABASE;
    }

    // 2. Try fetching from Vercel/Node API (server-side injection)
    try {
        const res = await fetch('/api/env.js', { cache: 'no-store' });
        if (res.ok) {
            const text = await res.text();
            const match = text.match(/window\.__SUPABASE\s*=\s*(\{[\s\S]*?\});/);
            if (match) {
                // Parse the JSON-like string roughly or eval it (safe-ish if from own API)
                // Using Function constructor to parse the JS object literal string
                const config = new Function(`return ${match[1]}`)();
                if (config.url && config.anonKey) {
                    window.__SUPABASE = config;
                    return config;
                }
            }
        }
    } catch (e) {
        // console.debug('Skipping /api/env.js');
    }

    // 3. Try fetching .env.local (Static Server)
    try {
        const res = await fetch('/.env.local');
        if (res.ok) {
            const text = await res.text();
            const urlMatch = text.match(/SUPABASE_URL=["']?([^"'\s]+)["']?/);
            const keyMatch = text.match(/SUPABASE_ANON_KEY=["']?([^"'\s]+)["']?/);

            if (urlMatch && keyMatch) {
                const config = {
                    url: urlMatch[1],
                    anonKey: keyMatch[1]
                };
                window.__SUPABASE = config;
                console.log('[Env] Loaded from .env.local');
                return config;
            }
        }
    } catch (e) {
        console.warn('[Env] Failed to load .env.local');
    }

    // 4. Try LocalStorage (Manual Setup)
    const localUrl = localStorage.getItem('SUPABASE_URL');
    const localKey = localStorage.getItem('SUPABASE_ANON_KEY');
    if (localUrl && localKey) {
        return { url: localUrl, anonKey: localKey };
    }

    // 5. Fallback return empty (will cause error downstream but legitimate)
    return { url: '', anonKey: '' };
}
