// js/pages/index.page.js
import { getPublishedArticles } from '../services/articlesService.js';
import { setupMobileNav } from '../ui/mobileNav.js';
import { listPublic, getBySlug, getBySlugOptional } from '../services/propertiesService.js';
import { createLead } from '../services/leadsService.js';
import { el, $, clear } from '../ui/dom.js';
import { formatPrice } from '../utils/format.js';
import { setupNav } from '../utils/config.js';
import { signOutIfAny } from '../auth/auth.js';
import { getFormData } from '../ui/forms.js';
import { toast } from '../ui/toast.js';
import { notifyLeadNew } from '../services/notifyService.js';
import { setupScrollToTop } from '../utils/scroll.js';

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

  // ลูกค้าจะเห็น "สถานะ" เฉพาะเมื่อบ้านพร้อมแล้วเท่านั้น
  const stage = String(property.renovation_stage || '').trim().toLowerCase();
  const customerVisible = property.customer_status_visible === true;
  const isReadyForCustomer = stage === 'ready' && customerVisible;

  if (isReadyForCustomer) {
    return { label: 'พร้อมเข้าอยู่', className: 'status-renovated' };
  }

  // New logic: Show under renovation
  if (stage === 'in_progress' || stage === 'planning' || stage === 'demolition' || stage === 'structural') {
    return { label: 'กำลังรีโนเวท', className: 'status-pending' };
  }
  return { label: 'บ้านรีโนเวท', className: 'status-renovated' };
}

/**
 * ดึง highlights หลักของบ้าน
 */
function buildHighlights(property = {}) {
  const highlights = [];
  if (property.beds) highlights.push(`${property.beds} ห้องนอน`);
  if (property.baths) highlights.push(`${property.baths} ห้องน้ำ`);
  if (property.parking) highlights.push(`${property.parking} ที่จอด`);

  // Land Size (Square Wah)
  if (property.land_size) {
    const val = String(property.land_size).trim();
    if (/^\d+(\.\d+)?$/.test(val)) {
      highlights.push(`${val} ตร.วา`);
    } else {
      highlights.push(val);
    }
  }

  // Living Area (Square Meter)
  if (property.size_text) {
    const val = String(property.size_text).trim();
    if (/^\d+(\.\d+)?$/.test(val)) {
      highlights.push(`${val} ตร.ม.`);
    } else {
      highlights.push(val);
    }
  }
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
  const pillClass = isNew ? 'property-pill status-new' : `property-pill ${badge.className}`;
  media.append(el('div', { className: pillClass, textContent: pillText }));
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
  // Tags removed as per request
  // if (tagsRow.childNodes.length) body.append(tagsRow);
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
  const projectGrid = $('#project-grid');
  if (projectGrid) clear(projectGrid);

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

  // Split into Ready vs Others
  const filteredData = data.filter(p => p.slug !== 'config-homepage-dream-home');
  const readyList = filteredData.filter(p => {
    const s = getStatusBadge(p);
    return s.className === 'status-renovated' || s.className === 'status-sold';
  });
  const projectList = filteredData.filter(p => {
    const s = getStatusBadge(p);
    return s.className !== 'status-renovated' && s.className !== 'status-sold';
  });

  // Render Ready
  if (readyList.length === 0) {
    grid.append(el('p', { textContent: 'ไม่มีบ้านพร้อมอยู่ขณะนี้' }));
  } else {
    const listToRender = showAllListings ? readyList : readyList.slice(0, 3);
    const newCount = 4;
    listToRender.forEach((property, idx) => {
      grid.append(renderPropertyCard(property, { isNew: idx < newCount, delay: idx * 70 }));
    });
  }

  // Render Projects
  if (projectGrid) {
    if (projectList.length === 0) {
      projectGrid.parentElement.style.display = 'none'; // Hide section if empty
    } else {
      projectGrid.parentElement.style.display = 'block';
      projectList.forEach((property, idx) => {
        projectGrid.append(renderPropertyCard(property, { variant: 'default', delay: idx * 70 }));
      });
    }
  }

  // Hero uses mixed or just featured? Let's use Ready ones for Hero if possible, else mixed.
  const heroCandidates = readyList.length ? readyList : data;
  renderHeroSlides(heroCandidates.slice(0, 3));

  if (featuredGrid) {
    // Restore featured grid logic if element exists
    const featured = heroCandidates.slice(0, 3);
    if (!featured.length) {
      featuredGrid.append(el('p', { textContent: 'กำลังเตรียมบ้านแนะนำ...' }));
    } else {
      featured.forEach((p, idx) => {
        featuredGrid.append(renderPropertyCard(p, { variant: 'featured', isNew: true, delay: idx * 80 }));
      });
    }
  }
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

      const { data, error } = await createLead(insert);
      if (error) throw error;

      // Notify Line
      try {
        await notifyLeadNew({ ...insert, id: data.id });
      } catch (notifyErr) {
        console.warn('Line notify failed', notifyErr);
      }

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

async function renderLatestArticles() {
  const container = document.querySelector('#articles .rl-article-grid');
  if (!container) return;

  try {
    const articles = await getPublishedArticles(3);

    if (!articles || articles.length === 0) {
      // Keep default placeholders if no articles
      return;
    }

    container.innerHTML = '';

    articles.forEach(article => {
      const articleCard = document.createElement('article');
      articleCard.className = 'rl-article-card';
      articleCard.style.cssText = 'background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.05); transition:transform 0.3s ease;';

      const imgUrl = article.cover_image || 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&q=80&w=600';

      articleCard.innerHTML = `
            <div class="rl-article-thumb" style="height:200px; overflow:hidden;">
              <img src="${imgUrl}"
                alt="${article.title}" style="width:100%; height:100%; object-fit:cover; transition:transform 0.5s ease;">
            </div>
            <div class="rl-article-content" style="padding:1.5rem;">
              <span style="font-size:0.8rem; color:#d97706; font-weight:700; text-transform:uppercase; letter-spacing:1px;">${article.category || 'General'}</span>
              <h3 style="font-size:1.25rem; margin:0.5rem 0 0.8rem; color:#333;">${article.title}</h3>
              <p style="font-size:0.95rem; color:#666; margin-bottom:1.5rem; line-height:1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${article.excerpt || ''}</p>
              <a href="/article.html?id=${article.id}" style="color:#b45309; text-decoration:none; font-weight:600; display:inline-flex; align-items:center;">
                อ่านเพิ่มเติม
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
            </div>
        `;
      container.appendChild(articleCard);
    });

  } catch (err) {
    console.error('Failed to load articles:', err);
  }
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

async function loadHomepageConfig() {
  try {
    const { data, error } = await getBySlugOptional('config-homepage-dream-home');

    if (error || !data) {
      return;
    }

    // 1. Prepare Config from Gallery
    let gallery = data.gallery;
    if (typeof gallery === 'string') {
      try { gallery = JSON.parse(gallery); } catch { gallery = []; }
    }

    if (Array.isArray(gallery)) {
      // Extract Config from index 2
      if (gallery.length > 2 && typeof gallery[2] === 'object') {
        const config = gallery[2];

        if (config.heroTitle) {
          const titleEl = document.getElementById('hero-title');
          if (titleEl) titleEl.innerHTML = config.heroTitle;
        }
        if (config.heroSubtitle) {
          const subCtx = document.getElementById('hero-subtitle');
          if (subCtx) subCtx.innerText = config.heroSubtitle;
        }
        if (config.heroImage) {
          const heroImg = document.getElementById('hero-image');
          if (heroImg) heroImg.src = config.heroImage;
        }
        if (config.heroCta1Text || config.heroCta1Link) {
          const el = document.getElementById('hero-cta1');
          if (el) {
            if (config.heroCta1Text) el.textContent = config.heroCta1Text;
            if (config.heroCta1Link) el.href = config.heroCta1Link;
          }
        }
        if (config.heroCta2Text || config.heroCta2Link) {
          const el = document.getElementById('hero-cta2');
          if (el) {
            if (config.heroCta2Text) el.textContent = config.heroCta2Text;
            if (config.heroCta2Link) el.href = config.heroCta2Link;
          }
        }
        if (config.heroBadgeTop) {
          const el = document.getElementById('hero-badge-top');
          if (el) el.innerText = config.heroBadgeTop;
        }
        if (config.heroBadgeTitle) {
          const el = document.getElementById('hero-badge-title');
          if (el) el.innerText = config.heroBadgeTitle;
        }
        if (config.heroBadgeBottom) {
          const el = document.getElementById('hero-badge-bottom');
          if (el) el.innerText = config.heroBadgeBottom;
        }
        if (config.whyTitle) {
          const el = document.getElementById('why-title');
          if (el) el.innerHTML = config.whyTitle;
        }
        if (config.whySubtitle) {
          const el = document.getElementById('why-subtitle');
          if (el) el.innerText = config.whySubtitle;
        }
        const applyWhyCard = (idTitle, idDesc, title, desc) => {
          const t = document.getElementById(idTitle);
          const d = document.getElementById(idDesc);
          if (title && t) t.innerText = title;
          if (desc && d) d.innerText = desc;
        };
        applyWhyCard('why-card1-title', 'why-card1-desc', config.whyCard1Title, config.whyCard1Desc);
        applyWhyCard('why-card2-title', 'why-card2-desc', config.whyCard2Title, config.whyCard2Desc);
        applyWhyCard('why-card3-title', 'why-card3-desc', config.whyCard3Title, config.whyCard3Desc);
      }

      // 2. Before/After Images
      if (gallery.length >= 2) {
        const beforeUrl = gallery[0];
        const afterUrl = gallery[1];

        // After Image
        const afterImg = document.querySelector('#rl-compare > img');
        if (afterImg && typeof afterUrl === 'string') afterImg.src = afterUrl;

        // Before Image
        const beforeImg = document.querySelector('#rl-before img');
        if (beforeImg && typeof beforeUrl === 'string') beforeImg.src = beforeUrl;
      }
    }

  } catch (err) {
    console.warn('Failed to load homepage config:', err);
  }
}


// --- Main execution ---
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  signOutIfAny();
  setupMobileNav();
  setupLandingUI();
  setupScrollToTop();
  setupCompareSlider();
  loadHomepageConfig();
  renderLatestArticles();
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
