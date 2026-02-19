import { S3Client } from '@aws-sdk/client-s3';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET
    && process.env.R2_PUBLIC_BASE_URL
  );
}

export function getR2Bucket() {
  return requiredEnv('R2_BUCKET');
}

export function getR2PublicBaseUrl() {
  return requiredEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
}

export function createR2Client() {
  const accountId = requiredEnv('R2_ACCOUNT_ID');
  const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY');

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

export function toSafePropertyPathSegment(propertyId) {
  return String(propertyId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

function toSafeBaseName(name = '') {
  return String(name || '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'document';
}

function toSafeExt(name = '') {
  return (String(name || '')
    .split('.')
    .pop() || 'bin')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'bin';
}

export function createR2Key({ propertyId, fileName }) {
  const safePropertyId = toSafePropertyPathSegment(propertyId);
  if (!safePropertyId) {
    throw new Error('Invalid property id');
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const base = toSafeBaseName(fileName);
  const ext = toSafeExt(fileName);
  const rand = Math.random().toString(36).slice(2, 10);

  return `property-${safePropertyId}/documents/${yyyy}/${mm}/${Date.now()}-${rand}-${base}.${ext}`;
}

export function buildPublicFileUrl(fileKey) {
  const base = getR2PublicBaseUrl();
  const encodedPath = fileKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${base}/${encodedPath}`;
}

export function extractR2KeyFromUrl(fileUrl) {
  if (!fileUrl) return '';

  const base = process.env.R2_PUBLIC_BASE_URL
    ? process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')
    : '';

  try {
    if (base && fileUrl.startsWith(`${base}/`)) {
      return decodeURIComponent(fileUrl.slice(base.length + 1));
    }
    const url = new URL(fileUrl);
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
}
