// js/pages/index.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { listPublic } from '../services/propertiesService.js';
import { createLead } from '../services/leadsService.js';
import { el, $, clear } from '../ui/dom.js';
import { formatPrice } from '../utils/format.js';
import { setupNav } from '../utils/config.js';
import { signOutIfAny } from '../auth/auth.js';
import { getFormData } from '../ui/forms.js';
import { toast } from '../ui/toast.js';

const LEAD_TOKEN_KEY = 'lead_token_v1';
const LEAD_LAST_TS_KEY = 'lead_last_ts';
let showAllListings = false;

function getLeadToken() {
  let token = sessionStorage.getItem(LEAD_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(LEAD_TOKEN_KEY, token);
  }
  return token;
}

let heroTimer = null;
let heroSlides = [];
let heroActiveIndex = 0;

/**
 * สร้าง badge สถานะรีโนเวท
 */
function getStatusBadge(property = {}) {
  const status = (property.status || '').toLowerCase();
  if (status === 'sold') return { label: 'ขายแล้ว', className: 'status-sold' };
  if (status === 'renovating' || status === 'progress') return { label: 'กำลังรีโนเวท', className: 'status-progress' };
  return { label: 'รีโนเวทพร้อมขาย', className: 'status-renovated' };
}

/**
 * ดึง highlights หลักของบ้าน
 */
function buildHighlights(property = {}) {
  const highlights = [];
  if (property.beds) highlights.push(`${property.beds} ห้องนอน`);
  if (property.baths) highlights.push(`${property.baths} ห้องน้ำ`);
  if (property.parking) highlights.push(`${property.parking} ที่จอด`);
  if (property.size_text) highlights.push(property.size_text);
  return highlights;
}

/**
 * การ์ดแสดงข้อมูลอสังหาฯ
 */
function renderPropertyCard(property, opts = {}) {
  const { variant = 'default', isNew = false } = opts;
  const link = `/property-detail.html?slug=${property.slug}`;
  const card = el('article', { className: `property-card ${variant === 'featured' ? 'property-card--featured' : ''}` });
  card.classList.add('rl-reveal');
  const delay = typeof opts.delay === 'number' ? opts.delay : 0;
  card.style.transitionDelay = `${delay}ms`;

  const media = el('a', { className: 'property-card__media', attributes: { href: link } });
  const image = el('img', { className: 'property-card__image', attributes: { src: property.cover_url || '/assets/img/placeholder.jpg', alt: property.title, loading: 'lazy' } });
  media.append(image);

  const badge = getStatusBadge(property);
  const pillText = isNew ? 'เข้าใหม่' : badge.label;
  media.append(el('div', { className: 'property-pill', textContent: pillText }));
  media.append(el('button', { className: 'property-heart', attributes: { type: 'button', 'aria-label': 'favorite' }, textContent: '♥' }));

  const body = el('div', { className: 'property-card__body' });
  const title = el('a', { className: 'property-card__title', textContent: property.title, attributes: { href: link } });
  const locationText = [property.district, property.province].filter(Boolean).join(', ') || 'สุราษฎร์ธานี';
  const address = el('p', { className: 'property-card__address', textContent: locationText });
  const price = el('div', { className: 'property-card__price', textContent: formatPrice(property.price) });

  const metaRow = el('div', { className: 'property-card__meta-row' });
  buildHighlights(property).forEach(txt => metaRow.append(el('span', { className: 'meta-chip', textContent: txt })));

  // Tags from API (array or comma-separated string)
  const tagsRow = el('div', { className: 'property-card__meta-row' });
  const tags = Array.isArray(property.tags)
    ? property.tags
    : (typeof property.tags_text === 'string' ? property.tags_text.split(',') : []);
  tags.slice(0, 3).forEach((tag) => {
    const t = String(tag || '').trim();
    if (!t) return;
    tagsRow.append(el('span', { className: 'meta-chip', textContent: t }));
  });

  const actionBar = el('div', { className: 'property-card__actions' });
  const detailBtn = el('a', {
    className: 'btn btn-primary btn-sm',
    textContent: 'ดูรายละเอียด',
    attributes: { href: link }
  });
  actionBar.append(detailBtn);

  body.append(title, address, price, metaRow);
  if (tagsRow.childNodes.length) body.append(tagsRow);
  body.append(actionBar);

  card.append(media, body);
  return card;
}

/**
 * โหลดและแสดงรายการอสังหาฯ
 */
async function loadProperties() {
  const grid = $('#property-grid');
  const featuredGrid = $('#featured-grid');
  const featuredList = $('#featured-list');
  if (!grid) {
    return;
  }

  const heroForm = $('#hero-filter-form');
  const advancedForm = $('#filter-form-advanced');

  clear(grid);
  if (featuredGrid) clear(featuredGrid);
  if (featuredList) clear(featuredList);
  for (let i = 0; i < 6; i++) grid.append(renderSkeletonCard());
  if (featuredGrid) for (let i = 0; i < 3; i++) featuredGrid.append(renderSkeletonCard());

  const filters = {
    q: heroForm?.elements?.q?.value || document.getElementById('hero-search-input')?.value || null,
    district: advancedForm?.elements?.district?.value || null,
    type: advancedForm?.elements?.type?.value || null,
    price_min: advancedForm?.elements?.price_min?.value || null,
    price_max: advancedForm?.elements?.price_max?.value || null,
  };

  const { data, error } = await listPublic(filters);

  clear(grid);
  if (featuredGrid) clear(featuredGrid);
  if (error) {
    console.error('Failed to load properties:', error);
    grid.append(el('p', { textContent: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' }));
    return;
  }

  if (!data.length) {
    grid.append(el('p', { textContent: 'ไม่พบรายการที่ตรงกับเงื่อนไข' }));
    renderHeroSlides([]); // Render fallback slides
    return;
  }

  renderHeroSlides(data.slice(0, 3));
  renderFeaturedList(data.slice(0, 3));

  const newCount = 4;
  const newArrivals = data.slice(0, newCount);

  // Featured/new arrivals (top 3-4)
  if (featuredGrid) {
    const featured = newArrivals.slice(0, 3);
    if (!featured.length) {
      featuredGrid.append(el('p', { textContent: 'กำลังเตรียมบ้านแนะนำ...' }));
    } else {
      featured.forEach((p, idx) => {
        featuredGrid.append(renderPropertyCard(p, { variant: 'featured', isNew: true, delay: idx * 80 }));
      });
    }
  }

  const listToRender = showAllListings ? data : data.slice(0, 3);
  listToRender.forEach((property, idx) => {
    grid.append(renderPropertyCard(property, { isNew: idx < newCount, delay: idx * 70 }));
  });
}

function setupLeadForm() {
  const form = $('#lead-callback-form');
  if (!form) return;

  const tokenInput = form.querySelector('input[name="lead_token"]');
  if (tokenInput) tokenInput.value = getLeadToken();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const now = Date.now();
    const last = Number(sessionStorage.getItem(LEAD_LAST_TS_KEY) || 0);
    if (now - last < 30000) {
      toast('โปรดลองใหม่อีกครั้งหลัง 30 วินาที', 2500, 'error');
      return;
    }
    const hp = form.querySelector('input[name="website"]');
    if (hp && hp.value.trim()) {
      toast('ไม่สามารถส่งได้', 1500, 'error');
      return;
    }
    const tokenVal = form.lead_token?.value || '';
    if (tokenVal !== getLeadToken()) {
      toast('เซสชันไม่ถูกต้อง กรุณารีเฟรชหน้า', 2500, 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type=submit]');
    const originalText = submitBtn?.textContent;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังส่ง...'; }

    try {
      const payload = getFormData(form);
      const noteParts = [];
      if (payload.interest) noteParts.push(`สนใจ: ${payload.interest}`);
      if (payload.budget) noteParts.push(`งบประมาณ: ${payload.budget}`);
      const insert = {
        name: payload.name || '',
        phone: payload.phone || '',
        note: noteParts.join(' | ') || 'ขอคำปรึกษารีโนเวท',
        property_slug: payload.property_slug || ''
      };

      const { error } = await createLead(insert);
      if (error) throw error;
      toast('รับข้อมูลแล้ว ทีมจะติดต่อกลับ', 2800, 'success');
      form.reset();
      sessionStorage.setItem(LEAD_LAST_TS_KEY, String(now));
      if (tokenInput) tokenInput.value = getLeadToken();
    } catch (err) {
      console.error(err);
      toast('ส่งข้อมูลไม่สำเร็จ ลองอีกครั้ง', 2600, 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
    }
  });
}

function setupInterestPrefill() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-interest]');
    if (!target) return;
    const interest = target.getAttribute('data-interest') || '';
    const slug = target.getAttribute('data-slug') || '';
    const interestInput = $('#lead-property');
    const slugInput = $('#lead-property-slug');
    if (interestInput) interestInput.value = interest;
    if (slugInput) slugInput.value = slug;

    const leadSection = document.getElementById('lead-form');
    if (leadSection) {
      leadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function renderHeroSlides(properties = []) {
  const slider = document.getElementById('hero-slider');
  let dotsWrap = document.getElementById('hero-slider-dots');
  if (!slider) return;

  // เตรียม container (ถ้าเคยถูก clear ไปแล้วให้สร้างใหม่)
  if (!dotsWrap) dotsWrap = el('div', { id: 'hero-slider-dots', className: 'hero-slider-dots' });

  clear(slider);
  clear(dotsWrap);
  heroSlides = properties.length ? properties : [{
    title: 'บ้านรีโนเวททำเลดี',
    district: 'เมืองสุราษฎร์ธานี',
    province: 'สุราษฎร์ธานี',
    price: 2590000,
    beds: 3,
    baths: 2,
    cover_url: '/assets/img/hero-background.jpg',
    slug: ''
  }];

  heroSlides.forEach((p, index) => {
    const slide = el('div', { className: `hero-slide${index === 0 ? ' is-active' : ''}`, attributes: { 'data-index': index } });
    const img = el('img', {
      attributes: {
        src: p.cover_url || '/assets/img/hero-background.jpg',
        alt: p.title || 'บ้านรีโนเวท',
        loading: 'lazy',
        fetchpriority: index === 0 ? 'high' : 'auto'
      }
    });
    const caption = el('div', { className: 'hero-slide-caption' });
    const loc = [p.district, p.province].filter(Boolean).join(', ');
    caption.append(
      el('p', { className: 'eyebrow', textContent: 'บ้านเข้าใหม่' }),
      el('h1', { textContent: p.title || 'บ้านรีโนเวททำเลดี' }),
      el('p', { className: 'hero-subtext', textContent: loc || 'สุราษฎร์ธานี' })
    );


    // Add meta (beds/baths/size + price)
    const metaDiv = el('div', { className: 'hero-slide-meta' });
    const highlights = buildHighlights(p); // Use existing function

    // Add highlights (beds, baths, size)
    highlights.forEach(h => {
      metaDiv.append(el('span', { className: 'pill', textContent: h }));
    });

    // Always add price pill to meta section
    metaDiv.append(el('span', { className: 'pill hero-price-pill', textContent: formatPrice(p.price || 0) }));

    caption.append(metaDiv);

    const ctas = el('div', { className: 'hero-ctas' });
    ctas.append(
      el('a', { className: 'btn btn-secondary btn-sm', textContent: 'ดูรายละเอียด', attributes: { href: p.slug ? `/property-detail.html?slug=${p.slug}` : '#listings' } })
    );
    caption.append(ctas);
    slide.append(img, caption);
    slider.append(slide);

    const dot = el('button', { className: `hero-dot${index === 0 ? ' is-active' : ''}`, attributes: { type: 'button', 'data-index': index } });
    dot.addEventListener('click', () => setHeroSlide(index));
    dotsWrap.append(dot);
  });

  // Place dots after the slider (outside image area)
  slider.after(dotsWrap);

  heroActiveIndex = 0;
  restartHeroTimer();
}

function renderFeaturedList(properties = []) {
  const wrap = $('#featured-list');
  if (!wrap) return;
  clear(wrap);
  if (!properties.length) {
    wrap.append(el('p', { textContent: 'ยังไม่มีรายการ' }));
    return;
  }
  properties.forEach((p) => {
    const item = el('div', { className: 'featured-item' });
    const thumb = el('img', {
      className: 'featured-thumb',
      attributes: { src: p.cover_url || '/assets/img/placeholder.jpg', alt: p.title || 'featured' }
    });
    const meta = el('div', { className: 'featured-meta' });
    meta.append(
      el('h4', { textContent: p.title || '-' }),
      el('p', { textContent: formatPrice(p.price || 0) }),
      el('p', { textContent: [p.district, p.province].filter(Boolean).join(', ') })
    );
    item.append(thumb, meta);
    wrap.append(item);
  });
}

function setHeroSlide(index) {
  heroActiveIndex = index % heroSlides.length;
  const slides = Array.from(document.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dot'));
  slides.forEach((s, i) => {
    if (i === heroActiveIndex) s.classList.add('is-active'); else s.classList.remove('is-active');
  });
  dots.forEach((d, i) => {
    if (i === heroActiveIndex) d.classList.add('is-active'); else d.classList.remove('is-active');
  });
  restartHeroTimer();
}

function restartHeroTimer() {
  if (heroTimer) clearInterval(heroTimer);
  if (heroSlides.length <= 1) return;
  heroTimer = setInterval(() => {
    heroActiveIndex = (heroActiveIndex + 1) % heroSlides.length;
    setHeroSlide(heroActiveIndex);
  }, 5000);
}

function renderSkeletonCard() {
  const card = el('div', { className: 'property-card' });
  const image = el('div', { className: 'skeleton', style: 'height: 220px;' });
  const body = el('div', { className: 'property-card__body' });
  const title = el('div', { className: 'skeleton', style: 'height: 20px; width: 80%; margin-bottom: 0.5rem;' });
  const address = el('div', { className: 'skeleton', style: 'height: 14px; width: 60%; margin-bottom: 1rem;' });
  const price = el('div', { className: 'skeleton', style: 'height: 22px; width: 50%; margin-top: auto;' });
  body.append(title, address, price);
  card.append(image, body);
  return card;
}

function setupLandingUI() {
  const nav = document.getElementById('rl-nav');
  const mobileMenu = document.getElementById('rl-nav-mobile');
  const toggleBtn = document.getElementById('rl-nav-toggle');
  if (toggleBtn && mobileMenu) {
    mobileMenu.style.display = 'none';
    const closeMobile = () => { mobileMenu.style.display = 'none'; };
    toggleBtn.addEventListener('click', () => {
      const isOpen = mobileMenu.style.display === 'grid';
      mobileMenu.style.display = isOpen ? 'none' : 'grid';
    });
    mobileMenu.querySelectorAll('a, button').forEach((node) => {
      node.addEventListener('click', closeMobile);
    });
  }
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll);
  }

  const reveals = Array.from(document.querySelectorAll('.rl-reveal'));
  if (reveals.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach((elNode) => io.observe(elNode));
  }

  const heroBtn = document.getElementById('hero-search-btn');
  if (heroBtn) {
    heroBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadProperties();
    });
  }
}

function setupCompareSlider() {
  const container = document.getElementById('rl-compare');
  const before = document.getElementById('rl-before');
  const handle = document.getElementById('rl-handle');
  if (!container || !before || !handle) return;

  let dragging = false;
  const setPosition = (clientX) => {
    const rect = container.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(clientX, rect.right));
    const percent = ((x - rect.left) / rect.width) * 100;
    before.style.width = `${percent}%`;
    handle.style.left = `${percent}%`;
  };

  container.addEventListener('pointerdown', (e) => {
    dragging = true;
    container.setPointerCapture(e.pointerId);
    setPosition(e.clientX);
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    setPosition(e.clientX);
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  // initial center
  before.style.width = '50%';
  handle.style.left = '50%';
}

// --- Main execution ---
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  signOutIfAny();
  setupMobileNav();
  setupLandingUI();
  setupCompareSlider();
  setupLeadForm();
  setupInterestPrefill();
  loadProperties(); // โหลดครั้งแรก
  const showAllBtn = document.getElementById('show-all-properties');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      showAllListings = true;
      loadProperties();
    });
  }

  const advancedFilterBtn = $('#advanced-filter-btn');
  if (advancedFilterBtn) {
    advancedFilterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadProperties();
    });
  }

  const heroFormElement = $('#hero-filter-form');
  if (heroFormElement) {
    heroFormElement.addEventListener('submit', (e) => {
      e.preventDefault();
      loadProperties();
    });
  }

  // Sidebar quick type filter
  document.querySelectorAll('.sidebar-list a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const val = link.getAttribute('data-value') || '';
      const typeSelect = $('#filter-type');
      if (typeSelect) {
        typeSelect.value = val;
        loadProperties();
      }
    });
  });

  // Mobile filter toggle
  const mobileFilterToggle = $('#mobile-filter-toggle');
  const advancedFilters = $('#filter-form-advanced');
  if (mobileFilterToggle && advancedFilters) {
    mobileFilterToggle.addEventListener('click', () => {
      advancedFilters.classList.toggle('is-open');
      const isOpen = advancedFilters.classList.contains('is-open');
      mobileFilterToggle.textContent = isOpen ? 'ซ่อนตัวกรองค้นหา' : 'แสดงตัวกรองค้นหา';
    });
  }
});
