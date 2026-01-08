// /api/env.js - inject public Supabase config to window.__SUPABASE
// Locked to allowed origins to prevent abuse of the anon key
const allowedOrigins = [
  'https://praweena-property.com',
  'https://www.praweena-property.com',
  'http://localhost:8000',
  'http://localhost:3000',
];

export default function handler(req, res) {
  const origin = req.headers.origin || '';
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';

  // Reject non-GET early
  if (req.method !== 'GET') {
    res.status(405).send('// Method not allowed');
    return;
  }

  // Origin allowlist check
  if (origin && !allowedOrigins.includes(origin)) {
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
