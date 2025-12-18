// js/pages/renovation-book-list.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { listAll } from '../services/propertiesService.js';
import { formatPrice } from '../utils/format.js';
import { $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

let allProperties = [];
let filteredProperties = [];
// ---------------- render list ----------------
let rbViewerModal = null;
let rbViewerFrame = null;
let rbViewerClose = null;

function getEl(id) {
  return document.getElementById(id);
}

function isMobileView() {
  return window.innerWidth < 1024;
}

function renderPropertyList(items) {
  const container = $('#rb-property-list');
  if (!container) return;

  clear(container);
  const mobileView = isMobileView();

  // Toggle classes for CSS styling
  if (mobileView) {
    container.classList.add('rb-property-list-grid');
    container.classList.remove('rb-property-list-table-wrapper');
  } else {
    container.classList.remove('rb-property-list-grid');
    container.classList.add('rb-property-list-table-wrapper');
  }

  if (!items || !items.length) {
    container.innerHTML = `
      <div class="rb-empty-state">
        ไม่พบบ้านตามเงื่อนไขที่ค้นหา
      </div>
    `;
    return;
  }

  if (mobileView) {
    // Render as Cards (Mobile)
    items.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'rb-property-card';

      const statusText = p.published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่';
      const statusColor = p.published ? '#16a34a' : '#6b7280';

      const detailUrl = p.slug
        ? `/property-detail.html?slug=${encodeURIComponent(p.slug)}`
        : '#';

      card.innerHTML = `
        <div class="rb-property-card-header">
          <div>
            <h3 class="rb-property-title">${p.title || '-'}</h3>
            <p class="rb-property-location">
              ${p.address || ''} ${p.district || ''} ${p.province || ''}
            </p>
          </div>
          <div class="rb-property-meta">
            <div class="rb-property-price">${formatPrice(Number(p.price) || 0)}</div>
            <div class="rb-property-status" style="color:${statusColor};">${statusText}</div>
          </div>
        </div>

        <p class="rb-property-brief">
          ขนาด: ${p.size_text || '-'} • ${p.beds ?? '-'} นอน • ${p.baths ?? '-'} น้ำ • ที่จอดรถ ${p.parking ?? '-'}
        </p>

        <div class="rb-property-card-footer">
          <button class="btn btn-sm btn-primary rb-open-book-btn" data-id="${p.id}">
            เปิดสมุดรีโนเวท
          </button>
          ${detailUrl !== '#'
          ? `<a class="btn btn-sm btn-sage" href="${detailUrl}" target="_blank">
                   ดูหน้าเว็บลูกค้า
                 </a>`
          : ''
        }
        </div>
      `;

      container.appendChild(card);
    });
  } else {
    // Render as Table (Desktop)
    const table = document.createElement('table');
    table.className = 'rb-property-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>หัวข้อ</th>
          <th>ราคา</th>
          <th>สถานะ</th>
          <th>อัปเดตล่าสุด</th>
          <th>จัดการ</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    items.forEach((p) => {
      const tr = document.createElement('tr');
      const statusText = p.published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่';
      const statusColor = p.published ? '#16a34a' : '#9ca3af';
      const detailUrl = p.slug
        ? `/property-detail.html?slug=${encodeURIComponent(p.slug)}`
        : '#';
      const updatedText = p.updated_at ? new Date(p.updated_at).toLocaleDateString('th-TH') : '-';

      tr.innerHTML = `
        <td>${p.title || '-'}</td>
        <td>${formatPrice(Number(p.price) || 0)}</td>
        <td style="color:${statusColor};font-weight:600;">${statusText}</td>
        <td>${updatedText}</td>
        <td class="rb-actions-cell">
          <button class="btn btn-sm btn-primary rb-open-book-btn" data-id="${p.id}">
            เปิดสมุดรีโนเวท
          </button>
          ${detailUrl !== '#'
          ? `<a class="btn btn-sm btn-sage" href="${detailUrl}" target="_blank">
                   ดูหน้าเว็บลูกค้า
                 </a>`
          : ''
        }
        </td>
      `;
      tbody.appendChild(tr);
    });

    container.appendChild(table);
  }

  // bind click
  container.querySelectorAll('.rb-open-book-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!id) return;
      const url = `/admin/renovation-book.html?property_id=${encodeURIComponent(id)}&embed=1`;
      openRbViewer(url);
    });
  });
}

// Re-render on resize (debounce)
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // Only re-render if we actually crossed the breakpoint (optimization) or just re-render simple
    // For simplicity, just re-render with current list
    if (filteredProperties.length > 0 || (allProperties.length === 0)) {
      renderPropertyList(filteredProperties);
    }
  }, 200);
});

// --------------- filter + search ---------------
function normalize(str) {
  return (str || '').toString().toLowerCase().trim();
}

function applyFilter() {
  const q = normalize(getEl('property-search')?.value || '');
  const statusFilter = getEl('property-filter-status')?.value || '';

  let items = allProperties.slice();

  if (q) {
    items = items.filter((p) => {
      const haystack = [
        p.title,
        p.address,
        p.district,
        p.province,
        p.house_code, // ถ้ามีฟิลด์นี้ใน table
        p.slug
      ]
        .map(normalize)
        .join(' ');

      return haystack.includes(q);
    });
  }

  if (statusFilter === 'published') {
    items = items.filter((p) => p.published);
  } else if (statusFilter === 'draft') {
    items = items.filter((p) => !p.published);
  }

  filteredProperties = items;
  renderPropertyList(items);
  renderSuggestions(q);
}

// --------------- auto-complete ---------------
function renderSuggestions(query) {
  const listEl = getEl('property-search-suggestions');
  if (!listEl) return;

  clear(listEl);

  if (!query) {
    listEl.classList.remove('show');
    return;
  }

  const q = normalize(query);

  const matches = allProperties
    .filter((p) => {
      const txt = [
        p.title,
        p.address,
        p.district,
        p.province,
        p.house_code,
        p.slug
      ]
        .map(normalize)
        .join(' ');
      return txt.includes(q);
    })
    .slice(0, 8); // แสดงสูงสุด 8 รายการ

  if (!matches.length) {
    listEl.classList.remove('show');
    return;
  }

  matches.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'property-search-suggestion-item';
    li.dataset.id = p.id;

    const location = [p.address, p.district].filter(Boolean).join(' • ');

    li.innerHTML = `
      <div class="suggestion-title">${p.title || '-'}</div>
      <div class="suggestion-sub">${location || ''}</div>
    `;

    // ใช้ mousedown เพื่อให้ทำงานก่อน input blur
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const id = li.dataset.id;
      if (!id) return;
      const url = `/admin/renovation-book.html?property_id=${encodeURIComponent(id)}`;
      window.location.href = url;
    });

    listEl.appendChild(li);
  });

  listEl.classList.add('show');
}

// --------------- load data ---------------
async function loadProperties() {
  const container = $('#rb-property-list');
  if (container) {
    container.innerHTML = `
      <div style="grid-column:1/-1;color:#6b7280;padding:1rem 0;">
        กำลังโหลดรายการบ้าน...
      </div>
    `;
  }

  try {
    const { data, error } = await listAll();
    if (error) throw error;

    allProperties = data || [];
    filteredProperties = allProperties.slice();
    renderPropertyList(filteredProperties);
  } catch (err) {
    console.error(err);
    toast('โหลดรายการบ้านไม่สำเร็จ', 3000, 'error');
    if (container) {
      container.innerHTML = `
        <div style="grid-column:1/-1;color:#b91c1c;padding:1rem 0;">
          เกิดข้อผิดพลาดในการโหลดข้อมูล
        </div>
      `;
    }
  }
}

// --------------- main init ---------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  rbViewerModal = getEl('rb-viewer-modal');
  rbViewerFrame = getEl('rb-viewer-frame');
  rbViewerClose = getEl('rb-viewer-close');

  if (rbViewerClose && rbViewerModal) {
    rbViewerClose.addEventListener('click', closeRbViewer);
    rbViewerModal.addEventListener('click', (e) => {
      if (e.target === rbViewerModal) closeRbViewer();
    });
  }

  await loadProperties();

  const searchInput = getEl('property-search');
  const statusSelect = getEl('property-filter-status');
  const suggestionsBox = getEl('property-search-suggestions');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyFilter();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        applyFilter();
        if (suggestionsBox) suggestionsBox.classList.remove('show');
      }
    });

    // ถ้า focus หาย ให้ซ่อน suggestion ผ่าน setTimeout หน่อยกันชนกับ mousedown
    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (suggestionsBox) suggestionsBox.classList.remove('show');
      }, 150);
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', applyFilter);
  }

  // scroll to top
  const scrollBtn = document.getElementById('scroll-to-top');
  const onScroll = () => {
    if (!scrollBtn) return;
    if (window.scrollY > 300) scrollBtn.classList.add('show');
    else scrollBtn.classList.remove('show');
  };
  window.addEventListener('scroll', onScroll);
  onScroll();

  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});

function openRbViewer(url) {
  if (!rbViewerModal || !rbViewerFrame) {
    window.location.href = url;
    return;
  }
  rbViewerFrame.src = url;
  rbViewerModal.classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeRbViewer() {
  if (!rbViewerModal || !rbViewerFrame) return;
  rbViewerModal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  rbViewerFrame.src = 'about:blank';
}
