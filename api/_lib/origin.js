const defaultOrigins = [
  'https://praweena-property.com',
  'https://www.praweena-property.com',
  'https://praweena-property-website.vercel.app',
  'https://praweena-property.vercel.app',
  'http://localhost:8000',
  'http://localhost:3000',
];

export function getAllowedOrigins() {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...defaultOrigins, ...envOrigins]));
}

function getHostOrigin(req) {
  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto']
    || (host.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : '';
}

export function isAllowedOrigin(req) {
  const origin = req.headers.origin || '';
  if (!origin) return true;

  const allowedOrigins = getAllowedOrigins();
  const hostOrigin = getHostOrigin(req);
  return allowedOrigins.includes(origin) || (hostOrigin && origin === hostOrigin);
}

export function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (!origin) return;
  if (!isAllowedOrigin(req)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}
