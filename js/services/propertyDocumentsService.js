// js/services/propertyDocumentsService.js
import { supabase } from '../utils/supabaseClient.js';

const DOCUMENT_BUCKET = 'property-documents';
const R2_UPLOAD_API = '/api/storage/r2-upload-url';
const R2_DELETE_API = '/api/storage/r2-delete';

function getStoragePathFromPublicUrl(fileUrl = '') {
  if (!fileUrl) return '';
  try {
    const url = new URL(fileUrl);
    const marker = `/storage/v1/object/public/${DOCUMENT_BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return '';
    const path = url.pathname.slice(idx + marker.length);
    return decodeURIComponent(path);
  } catch (err) {
    return '';
  }
}

function getErrorMessage(error, fallback = 'Unknown error') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

export async function listDocumentsByProperty(propertyId, docType = 'all') {
  let query = supabase
    .from('property_documents')
    .select('*')
    .eq('property_id', propertyId)
    .order('doc_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (docType && docType !== 'all') {
    query = query.eq('doc_type', docType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function upsertPropertyDocument(row) {
  const { data: { user } } = await supabase.auth.getUser();

  const payload = {
    id: row.id || undefined,
    property_id: row.property_id,
    title: row.title || null,
    doc_type: row.doc_type || 'other',
    doc_date: row.doc_date || null,
    amount: row.amount ?? null,
    vendor_name: row.vendor_name || null,
    note: row.note || null,
    file_url: row.file_url || null,
    source_quote_id: row.source_quote_id || null,
    created_by: row.created_by || user?.id || null
  };

  const { data, error } = await supabase
    .from('property_documents')
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePropertyDocument(id) {
  const { error } = await supabase
    .from('property_documents')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deletePropertyDocumentFile(fileUrl) {
  if (!fileUrl) return;

  // Legacy support: old files stored in Supabase bucket.
  const path = getStoragePathFromPublicUrl(fileUrl);
  if (path) {
    const { error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .remove([path]);

    if (error) throw error;
    return;
  }

  // Current path: R2
  const res = await fetch(R2_DELETE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl })
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.error || `R2 delete failed (${res.status})`);
  }
}

function toSafePropertyPathSegment(propertyId) {
  return String(propertyId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function uploadPropertyDocumentFile(file, propertyId) {
  const safePropertyId = toSafePropertyPathSegment(propertyId);
  if (!safePropertyId) {
    throw new Error('Missing property id for document upload');
  }

  const initRes = await fetch(R2_UPLOAD_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      propertyId: safePropertyId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size || 0
    })
  });

  const initPayload = await initRes.json().catch(() => ({}));
  if (!initRes.ok || initPayload?.ok === false) {
    const reason = initPayload?.error || `R2 upload init failed (${initRes.status})`;
    throw new Error(reason);
  }

  const uploadUrl = initPayload?.uploadUrl;
  const fileUrl = initPayload?.fileUrl;
  if (!uploadUrl || !fileUrl) {
    throw new Error('R2 upload init response is invalid');
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => '');
    throw new Error(`R2 upload failed (${uploadRes.status}): ${getErrorMessage(detail, 'upload error')}`);
  }

  return fileUrl;
}
