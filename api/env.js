// /api/env.js - inject public Supabase config to window.__SUPABASE
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';

  res.setHeader('Content-Type', 'application/javascript');
  res.status(200).send(`window.__SUPABASE = { url: "${url}", anonKey: "${anon}" };`);
}
