import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { requireAdminPage } from '../auth/adminGuard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { listLogs } from '../services/logsService.js';

const tbody = $('#logs-table tbody');

function fmt(dt) {
  try {
    const d = new Date(dt);
    const date = d.toLocaleDateString('th-TH', { year:'numeric', month:'2-digit', day:'2-digit' });
    const time = d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    return `${date} ${time}`;
  } catch { return dt; }
}

function renderRows(rows = []) {
  clear(tbody);
  if (!rows.length) {
    const tr = el('tr');
    tr.append(el('td', { attributes: { colspan: 4 }, style: 'text-align:center;color:#6b7280;', textContent: 'No logs' }));
    tbody.append(tr);
    return;
  }
  rows.forEach(r => {
    const tr = el('tr');
    tr.append(
      el('td', { textContent: fmt(r.created_at) }),
      el('td', { textContent: r.type }),
      el('td', { textContent: r.actor || '-' }),
      el('td', { textContent: r.message || '-' })
    );
    tbody.append(tr);
  });
}

async function load() {
  const type = $('#type-filter').value || '';
  try {
    const rows = await listLogs({ type: type || undefined, limit: 500 });
    renderRows(rows);
  } catch (err) {
    console.error(err);
    toast('โหลด Logs ไม่สำเร็จ', 2500, 'error');
  }
}

function exportCSV() {
  const rows = Array.from(tbody.querySelectorAll('tr')).map(tr =>
    Array.from(tr.children).map(td => td.textContent.replaceAll('\n', ' ').trim())
  );
  const header = [['เวลา', 'ประเภท', 'ผู้กระทำ', 'ข้อความ']];
  const all = header.concat(rows);
  const csv = all.map(r =>
    r.map(v => {
      const needsQuote = /[",\n]/.test(v);
      let s = v.replaceAll('"', '""');
      return needsQuote ? `"${s}"` : s;
    }).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.download = `praweena-logs-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  const ok = await requireAdminPage({ redirect: '/index.html', showBadge: true });
  if (!ok) return;

  setupNav();
  signOutIfAny();
  setupMobileNav();

  $('#refresh-btn').addEventListener('click', load);
  $('#type-filter').addEventListener('change', load);
  $('#export-csv-btn').addEventListener('click', exportCSV);

  load();
});
