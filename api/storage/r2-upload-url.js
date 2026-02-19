import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { applyCors, isAllowedOrigin } from '../_lib/origin.js';
import {
  buildPublicFileUrl,
  createR2Client,
  createR2Key,
  getR2Bucket,
  hasR2Config
} from '../_lib/r2.js';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden origin' });
  }

  if (!hasR2Config()) {
    return res.status(503).json({
      ok: false,
      error: 'R2 is not configured on server'
    });
  }

  try {
    const body = getBody(req);
    const propertyId = body.propertyId;
    const fileName = String(body.fileName || '').trim();
    const contentType = String(body.contentType || 'application/octet-stream').trim().toLowerCase();
    const fileSize = Number(body.fileSize || 0);
    const maxBytes = Number(process.env.R2_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);

    if (!propertyId) {
      return res.status(400).json({ ok: false, error: 'propertyId is required' });
    }
    if (!fileName) {
      return res.status(400).json({ ok: false, error: 'fileName is required' });
    }
    if (!ALLOWED_MIME.has(contentType)) {
      return res.status(400).json({ ok: false, error: `Unsupported file type: ${contentType}` });
    }
    if (fileSize > maxBytes) {
      return res.status(400).json({ ok: false, error: `File too large (max ${maxBytes} bytes)` });
    }

    const key = createR2Key({ propertyId, fileName });
    const bucket = getR2Bucket();
    const client = createR2Client();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType
    });

    const expiresIn = 60 * 10;
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    const fileUrl = buildPublicFileUrl(key);

    return res.status(200).json({
      ok: true,
      provider: 'r2',
      fileKey: key,
      fileUrl,
      uploadUrl,
      expiresIn
    });
  } catch (err) {
    console.error('r2-upload-url error', err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err)
    });
  }
}
