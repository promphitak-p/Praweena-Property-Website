import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { applyCors, isAllowedOrigin } from '../_lib/origin.js';
import {
  createR2Client,
  extractR2KeyFromUrl,
  getR2Bucket,
  hasR2Config
} from '../_lib/r2.js';

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
    const fileKey = String(body.fileKey || '').trim();
    const fileUrl = String(body.fileUrl || '').trim();
    const key = fileKey || extractR2KeyFromUrl(fileUrl);

    if (!key) {
      return res.status(400).json({ ok: false, error: 'fileKey or fileUrl is required' });
    }
    if (!key.startsWith('property-')) {
      return res.status(400).json({ ok: false, error: 'Invalid file key prefix' });
    }

    const client = createR2Client();
    await client.send(new DeleteObjectCommand({
      Bucket: getR2Bucket(),
      Key: key
    }));

    return res.status(200).json({ ok: true, deleted: true, fileKey: key });
  } catch (err) {
    console.error('r2-delete error', err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err)
    });
  }
}
