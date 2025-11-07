// /js/pages/logs.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { requireAdminPage } from '../auth/adminGuard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { supabase } from '../utils/supabaseClient.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const tbody = $('#logs-table tbody');
const btnRefresh = $('#refresh-logs');
const btnExport = $('#export-csv');

let lastRows = [];

function fmtDate(dt) {
  try {
    const d = new Date(dt);
    const th = d.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const t = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${th} ${t}`;
  } catch {
    return dt ?? '';
  }
}

function renderRow(r) {
  const tr = el('tr');
  tr.append(
    el('td', { textContent: fmtDate(r.created_at) }),
    el('td', { textContent: r.level || '-' }),
    el('td', { textContent: r.event || '-' }),
    el('td', { textContent: r.status_code ?? '-' }),
    el('td', { textContent: r.send_to || '-' }),
    el('td', { textContent: r.message || '-' })
  );
  tbody.append(tr);
}

function renderSkeleton() {
  clear(tbody);
  const tr = el('tr');
  tr.append(el('td', {
    attributes: { colspan: 6 },
    innerHTML: `<div class="skeleton" style="height:48px;border-radius:10px;"></div>`
  }));
  tbody.append(tr);
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportCSV(rows) {
  const headers = ['created_at','level','event','status_code','send_to','message'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const line = [
      csvEscape(r.created_at),
      csvEscape(r.level),
      csvEscape(r.event),
      csvEscape(r.status_code),
      csvEscape(r.send_to),
      csvEscape(r.message)
    ].join(',');
    lines.push(line);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `notify_logs_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function loadLogs() {
  renderSkeleton();
  const { data, error } = await supabase
    .from('notify_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    clear(tbody);
    toast('โหลด Logs ไม่สำเร็จ: ' + error.message, 3500, 'error');
    console.error(error);
    return;
  }

  lastRows = data || [];
  clear(tbody);
  if (!lastRows.length) {
    const tr = el('tr');
    tr.append(el('td', {
      attributes: { colspan: 6 },
      style: 'text-align:center;color:#6b7280;padding:1rem;',
      textContent: 'ไม่มีข้อมูล'
    }));
    tbody.append(tr);
    return;
  }

  lastRows.forEach(renderRow);
}

document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  const ok = await requireAdminPage({ redirect: '/index.html', showBadge: true });
  if (!ok) return;

  setupNav();
  signOutIfAny();
  setupMobileNav();

  await loadLogs();

  btnRefresh?.addEventListener('click', loadLogs);
  btnExport?.addEventListener('click', () => {
    if (!lastRows.length) {
      toast('ยังไม่มีข้อมูลสำหรับส่งออก', 2000, 'info');
      return;
    }
    exportCSV(lastRows);
  });
});
