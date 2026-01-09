// /api/env.js - inject public Supabase config to window.__SUPABASE
// Locked to allowed origins to prevent abuse of the anon key
const defaultOrigins = [
  'https://praweena-property.com',
  'https://www.praweena-property.com',
  'https://praweena-property-website.vercel.app',
  'https://praweena-property.vercel.app',
  'http://localhost:8000',
  'http://localhost:3000',
];

const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

export default function handler(req, res) {
  const origin = req.headers.origin || '';
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';

  // Reject non-GET early
  if (req.method !== 'GET') {
    res.status(405).send('// Method not allowed');
    return;
  }

  // Origin allowlist check (allow if origin matches host or is in list)
  const hostOrigin = req.headers.host ? `https://${req.headers.host}` : '';
  const isAllowed = !origin
    || allowedOrigins.includes(origin)
    || (hostOrigin && origin === hostOrigin);

  if (!isAllowed) {
    res.setHeader('Vary', 'Origin');
    res.status(403).send('// Forbidden');
    return;
  }

  // CORS response (if origin is allowed)
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Content-Type', 'application/javascript');
  res.status(200).send(`window.__SUPABASE = { url: "${url}", anonKey: "${anon}" };`);
}
