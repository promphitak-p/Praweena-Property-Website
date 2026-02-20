/**
 * To-Do List Tab Logic
 * Handles all functionality for the renovation to-do list feature
 */

import {
    listCategories,
    listTodosByProperty,
    createTodo,
    updateTodo,
    deleteTodo,
    toggleTodoStatus,
    getPendingReminders,
    markReminderSent,
    getTaskStats,
    updateTodoOrder,
    generateDefaultTodos
} from '../services/renovationTodosService.js';

import {
    requestNotificationPermission,
    getNotificationPermission,
    getPermissionStatusText,
    checkPendingReminders,
    scheduleNotificationCheck
} from '../utils/notifications.js';

import {
    listPurchasesByTodo,
    listPurchasesByProperty,
    upsertPurchaseItem,
    updatePurchaseStatus,
    deletePurchaseItem
} from '../services/todoPurchasesService.js';

import { listContractorsForProperty } from '../services/propertyContractorsService.js';
import {
    listIssuesByProperty,
    upsertIssue,
    deleteIssue
} from '../services/renovationIssuesService.js';
import {
    getPhaseLockSetting,
    savePhaseLockSetting
} from '../services/renovationPhaseService.js';

import { toast } from '../ui/toast.js';
import { clear } from '../ui/dom.js';

// State
let currentPropertyId = null;
let currentCategoryFilter = 'all';
let allCategories = [];
let allTodos = [];
let notificationCheckInterval = null;
let currentPurchaseTodoId = null;
let currentPurchaseItems = [];
let purchaseSummaryCache = {};
let purchaseOverviewModal = null;
const TODO_VIEWS = ['list', 'kanban', 'timeline', 'calendar', 'gantt', 'city', 'floor'];
let currentTodoView = (() => {
    const saved = localStorage.getItem('todoViewMode');
    return TODO_VIEWS.includes(saved) ? saved : 'list';
})();
let calendarMonthOffset = 0;
let currentPropertyContractors = [];
let contractorLookup = new Map();
let currentIssues = [];
let phaseLockEnabled = false;
let phaseStatusCache = null;

const PHASES = [
    { key: 'prep', label: 'เตรียมงาน' },
    { key: 'structure', label: 'โครงสร้าง' },
    { key: 'systems', label: 'ระบบ' },
    { key: 'finishes', label: 'ตกแต่ง' },
    { key: 'exterior', label: 'ภายนอก' },
    { key: 'other', label: 'อื่นๆ' }
];

// Confirm Modal State
let confirmResolve = null;
let confirmModal = null;

// Action Modal State
let actionModal = null;
let currentActionTodoId = null;
let purchaseModal = null;

/**
 * Initialize the to-do tab
 */
export async function initTodoTab() {
    // Load categories
    await loadCategories();

    // Setup notification banner
    setupNotificationBanner();

    // Setup Confirm Modal
    initConfirmModal();

    // Setup Action Modal
    initActionModal();

    // Setup Purchase Modal
    initPurchaseModal();

    // Setup Purchase Overview Modal
    initPurchaseOverviewModal();

    // Setup event listeners
    setupEventListeners();

    // Start notification checking
    startNotificationChecking();
}

/**
 * Load all categories from database
 */
async function loadCategories() {
    const { data, error } = await listCategories();

    if (error) {
        console.error('Error loading categories:', error);
        toast('ไม่สามารถโหลดหมวดหมู่ได้', 3000, 'error');
        return;
    }

    allCategories = data || [];
    populateCategorySelects();
}

/**
 * Populate category dropdowns and filters
 */
function populateCategorySelects() {
    // Populate modal category select
    const categorySelect = document.getElementById('todo-category');
    if (categorySelect) {
        clear(categorySelect);
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- เลือกหมวดหมู่ --';
        categorySelect.appendChild(defaultOption);

        allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = `${cat.icon} ${cat.name}`;
            categorySelect.appendChild(option);
        });
    }

    // Populate category filter buttons
    const filterContainer = document.getElementById('todo-category-filters');
    if (filterContainer && allCategories.length > 0) {
        // Keep the "All" button, add category buttons
        allCategories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-filter-btn';
            btn.dataset.category = cat.id;

            const iconSpan = document.createElement('span');
            iconSpan.textContent = cat.icon || '📌';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = ` ${cat.name || ''}`;

            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.id = `badge-${cat.id}`;
            badge.textContent = '0';

            btn.appendChild(iconSpan);
            btn.appendChild(nameSpan);
            btn.appendChild(badge);
            filterContainer.appendChild(btn);
        });
    }
}

/**
 * Setup notification permission banner
 */
function setupNotificationBanner() {
    const banner = document.getElementById('todo-notification-banner');
    const enableBtn = document.getElementById('todo-enable-notifications-btn');
    const title = document.getElementById('todo-notif-title');
    const message = document.getElementById('todo-notif-message');

    if (!banner) return;

    const permission = getNotificationPermission();

    if (permission === 'unsupported') {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'flex';

    if (permission === 'granted') {
        banner.className = 'todo-notification-banner enabled';
        title.textContent = 'การแจ้งเตือนเปิดอยู่';
        message.textContent = `สถานะ: ${getPermissionStatusText()}`;
        enableBtn.style.display = 'none';
    } else if (permission === 'denied') {
        banner.className = 'todo-notification-banner disabled';
        title.textContent = 'การแจ้งเตือนปิดอยู่';
        message.textContent = 'กรุณาเปิดการแจ้งเตือนในการตั้งค่าเบราว์เซอร์';
        enableBtn.style.display = 'none';
    } else {
        banner.className = 'todo-notification-banner';
        title.textContent = 'เปิดใช้งานการแจ้งเตือน';
        message.textContent = 'รับการแจ้งเตือนเมื่อถึงเวลาทำงาน';
        enableBtn.style.display = 'block';
    }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Enable notifications button
    const enableBtn = document.getElementById('todo-enable-notifications-btn');
    if (enableBtn) {
        enableBtn.addEventListener('click', async () => {
            const result = await requestNotificationPermission();
            if (result.granted) {
                toast('เปิดการแจ้งเตือนสำเร็จ!', 2000, 'success');
            } else {
                toast('ไม่สามารถเปิดการแจ้งเตือนได้', 3000, 'error');
            }
            setupNotificationBanner();
        });
    }

    // Add task button
    const addBtn = document.getElementById('todo-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openTodoModal());
    }
    const purchaseClose = document.getElementById('todo-purchase-close');
    const purchaseCancel = document.getElementById('purchase-cancel-btn');
    if (purchaseClose) purchaseClose.addEventListener('click', closePurchaseModal);
    if (purchaseCancel) purchaseCancel.addEventListener('click', closePurchaseModal);
    const purchaseSave = document.getElementById('purchase-save-btn');
    if (purchaseSave) purchaseSave.addEventListener('click', handleSavePurchase);
    const overviewBtn = document.getElementById('todo-purchase-overview-btn');
    if (overviewBtn) overviewBtn.addEventListener('click', openPurchaseOverviewModal);

    // Modal close buttons
    const modalClose = document.getElementById('todo-modal-close');
    const cancelBtn = document.getElementById('todo-cancel-btn');
    if (modalClose) modalClose.addEventListener('click', closeTodoModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeTodoModal);

    // Form submit
    const form = document.getElementById('todo-form');
    if (form) {
        form.addEventListener('submit', handleTodoSubmit);
    }

    // Category filter buttons (delegated)
    const filterContainer = document.getElementById('todo-category-filters');
    if (filterContainer) {
        filterContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-filter-btn');
            if (btn) {
                const category = btn.dataset.category;
                setActiveCategoryFilter(category);
                renderTodos();
            }
        });
    }

    const viewSwitch = document.getElementById('todo-view-switch');
    if (viewSwitch) {
        viewSwitch.addEventListener('click', (e) => {
            const btn = e.target.closest('.todo-view-btn');
            if (!btn) return;
            setTodoView(btn.dataset.view);
        });
        setTodoView(currentTodoView);
    }
}

/**
 * Set property for to-do list
 */
export function setTodoProperty(propertyId, propertyTitle) {
    currentPropertyId = propertyId;

    // Update hidden input
    const propertyIdInput = document.getElementById('todo-property-id');
    if (propertyIdInput) {
        propertyIdInput.value = propertyId;
    }

    // Show content area and add button
    const contentArea = document.getElementById('todo-content-area');
    const addBtn = document.getElementById('todo-add-btn');
    if (contentArea) contentArea.style.display = 'block';
    if (addBtn) addBtn.style.display = 'flex';

    loadContractorsForProperty();

    // Load todos for this property
    loadTodosForProperty();
}

/**
 * Load todos for current property
 */
async function loadTodosForProperty() {
    if (!currentPropertyId) return;

    const { data, error } = await listTodosByProperty(currentPropertyId);

    if (error) {
        console.error('Error loading todos:', error);
        toast('ไม่สามารถโหลดรายการงานได้', 3000, 'error');
        return;
    }

    allTodos = data || [];

    // Auto-generate if empty (User Request)
    if (allTodos.length === 0) {
        console.log('Auto-generating default todos...');
        toast('กำลังสร้างรายการงานมาตรฐานอัตโนมัติ...', 2000, 'info');
        await generateDefaultTodos(currentPropertyId);

        // Reload fresh
        const { data: newData } = await listTodosByProperty(currentPropertyId);
        allTodos = newData || [];
    }

    renderTodos();
    updateStats();
    loadPurchaseOverview();
    refreshBudgetSummary();
}

/**
 * Render todos based on current filter
 */
function renderTodos() {
    const container = document.getElementById('todo-list-container');
    const emptyState = document.getElementById('todo-empty-state');

    if (!container) return;

    // Filter todos
    let filteredTodos = allTodos;
    if (currentCategoryFilter !== 'all') {
        filteredTodos = allTodos.filter(t => t.category_id === currentCategoryFilter);
    }

    // Show empty state if no todos
    if (filteredTodos.length === 0) {
        container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        document.querySelectorAll('.todo-view-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        const budgetSummary = document.getElementById('todo-budget-summary');
        if (budgetSummary) budgetSummary.textContent = '';
        return;
    }

    container.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    document.querySelectorAll('.todo-view-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `todo-view-${currentTodoView}`);
    });

    // Show purchase overview container
    const overview = document.getElementById('todo-purchase-overview');
    if (overview) overview.style.display = 'block';

    if (currentTodoView === 'list') {
        renderListView(filteredTodos);
    } else if (currentTodoView === 'kanban') {
        renderKanbanView(filteredTodos);
    } else if (currentTodoView === 'timeline') {
        renderTimelineView(filteredTodos);
    } else if (currentTodoView === 'calendar') {
        renderCalendarView(filteredTodos);
    } else if (currentTodoView === 'gantt') {
        renderGanttView(filteredTodos);
    } else if (currentTodoView === 'city') {
        renderCityView(filteredTodos);
    } else if (currentTodoView === 'floor') {
        renderFloorView(filteredTodos);
    }

    refreshBudgetSummary();
}

function renderListView(filteredTodos) {
    const container = document.getElementById('todo-list-container');
    if (!container) return;
    clear(container);

    const grouped = {};
    filteredTodos.forEach(todo => {
        const catId = todo.category_id || 'uncategorized';
        if (!grouped[catId]) grouped[catId] = [];
        grouped[catId].push(todo);
    });

    const orderedCategories = [...allCategories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    orderedCategories.forEach(cat => {
        const todos = grouped[cat.id];
        if (!todos || todos.length === 0) return;
        const section = createCategorySection(cat, todos.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
        container.appendChild(section);
    });

    if (grouped.uncategorized) {
        const section = createCategorySection(null, grouped.uncategorized.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
        container.appendChild(section);
    }

    initSortable();
}

function renderKanbanView(filteredTodos) {
    const wrap = document.getElementById('todo-view-kanban');
    if (!wrap) return;
    wrap.innerHTML = '';

    const columns = [
        { key: 'pending', label: 'รอดำเนินการ' },
        { key: 'in_progress', label: 'กำลังทำ' },
        { key: 'completed', label: 'เสร็จแล้ว' },
        { key: 'cancelled', label: 'ยกเลิก/ข้าม' }
    ];

    const grid = document.createElement('div');
    grid.className = 'todo-kanban';

    columns.forEach(col => {
        const colEl = document.createElement('div');
        colEl.className = 'todo-kanban-col';
        colEl.innerHTML = `<h4>${col.label}</h4>`;
        const list = filteredTodos.filter(t => t.status === col.key);
        list.forEach(todo => {
            const card = document.createElement('div');
            card.className = 'todo-kanban-card';
            card.innerHTML = `
        <div style="font-weight:600;">${escapeHtml(todo.title || '-')}</div>
        ${todo.due_date ? `<div style="color:#6b7280;">📅 ${formatDate(todo.due_date)}</div>` : ''}
      `;
            colEl.appendChild(card);
        });
        grid.appendChild(colEl);
    });

    wrap.appendChild(grid);
}

function renderTimelineView(filteredTodos) {
    const wrap = document.getElementById('todo-view-timeline');
    if (!wrap) return;
    wrap.innerHTML = '';

    const sorted = filteredTodos.slice().sort((a, b) => {
        const aDate = a.due_date ? new Date(a.due_date) : new Date(8640000000000000);
        const bDate = b.due_date ? new Date(b.due_date) : new Date(8640000000000000);
        return aDate - bDate;
    });

    const list = document.createElement('div');
    list.className = 'todo-timeline';

    sorted.forEach(todo => {
        const item = document.createElement('div');
        item.className = 'todo-timeline-item';
        item.innerHTML = `
      <div style="font-weight:600;">${escapeHtml(todo.title || '-')}</div>
      <div style="color:#6b7280;">${todo.due_date ? `📅 ${formatDate(todo.due_date)}` : 'ไม่มีวันกำหนด'}</div>
    `;
        list.appendChild(item);
    });

    wrap.appendChild(list);
}

function renderCalendarView(filteredTodos) {
    const wrap = document.getElementById('todo-view-calendar');
    if (!wrap) return;
    wrap.innerHTML = '';

    const now = new Date();
    const viewDate = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const header = document.createElement('div');
    header.className = 'todo-calendar-header';
    header.innerHTML = `
    <button type="button" class="btn btn-sm btn-secondary" data-cal-nav="-1">เดือนก่อน</button>
    <div style="font-weight:700;">${firstDay.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</div>
    <button type="button" class="btn btn-sm btn-secondary" data-cal-nav="1">เดือนถัดไป</button>
  `;

    const grid = document.createElement('div');
    grid.className = 'todo-calendar-grid';

    const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    dayNames.forEach(name => {
        const cell = document.createElement('div');
        cell.className = 'todo-calendar-day';
        cell.innerHTML = `<div class="day-number">${name}</div>`;
        grid.appendChild(cell);
    });

    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'todo-calendar-day';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = new Date(year, month, day).toISOString().slice(0, 10);
        const tasks = filteredTodos.filter(t => t.due_date === dateKey);
        const cell = document.createElement('div');
        cell.className = 'todo-calendar-day';
        cell.innerHTML = `<div class="day-number">${day}</div>`;
        tasks.forEach(todo => {
            const taskEl = document.createElement('div');
            taskEl.className = 'todo-calendar-task';
            taskEl.innerHTML = `
        <div style="font-weight:600;">${escapeHtml(todo.title || '-')}</div>
      `;
            cell.appendChild(taskEl);
        });
        grid.appendChild(cell);
    }

    const box = document.createElement('div');
    box.className = 'todo-calendar';
    box.appendChild(header);
    box.appendChild(grid);
    wrap.appendChild(box);

    wrap.querySelectorAll('[data-cal-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
            calendarMonthOffset += Number(btn.dataset.calNav);
            renderCalendarView(filteredTodos);
        });
    });
}

function renderGanttView(filteredTodos) {
    const wrap = document.getElementById('todo-view-gantt');
    if (!wrap) return;
    wrap.innerHTML = '';

    const list = document.createElement('div');
    list.className = 'todo-gantt';

    const sorted = filteredTodos.slice().sort((a, b) => {
        const aDate = a.due_date ? new Date(a.due_date) : new Date(8640000000000000);
        const bDate = b.due_date ? new Date(b.due_date) : new Date(8640000000000000);
        return aDate - bDate;
    });

    sorted.forEach(todo => {
        const progress = todo.status === 'completed' || todo.status === 'cancelled'
            ? 100
            : todo.status === 'in_progress'
                ? 60
                : 20;
        const row = document.createElement('div');
        row.className = 'todo-gantt-row';
        row.innerHTML = `
      <div>
        <div style="font-weight:600;">${escapeHtml(todo.title || '-')}</div>
      </div>
      <div>${todo.due_date ? formatDate(todo.due_date) : '-'}</div>
      <div class="todo-gantt-bar"><span style="width:${progress}%"></span></div>
    `;
        list.appendChild(row);
    });

    wrap.appendChild(list);
}

function formatTodoStatus(status) {
    const map = {
        pending: 'รอดำเนินการ',
        in_progress: 'กำลังทำ',
        completed: 'เสร็จแล้ว',
        cancelled: 'ข้ามแล้ว'
    };
    return map[status] || status || '-';
}

function renderCityView(filteredTodos) {
    const wrap = document.getElementById('todo-view-city');
    if (!wrap) return;
    wrap.innerHTML = '';

    const grouped = new Map();
    filteredTodos.forEach(todo => {
        const key = todo.category_id ? String(todo.category_id) : 'uncategorized';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(todo);
    });

    const orderedCategories = [...allCategories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const grid = document.createElement('div');
    grid.className = 'todo-city-grid';

    orderedCategories.forEach(cat => {
        const todos = grouped.get(String(cat.id));
        if (!todos || todos.length === 0) return;

        const tile = document.createElement('div');
        tile.className = 'todo-city-tile';

        const title = document.createElement('div');
        title.className = 'todo-city-title';
        title.textContent = `${cat.icon || '•'} ${cat.name || 'Category'}`;
        tile.appendChild(title);

        const doneCount = todos.filter(t => t.status === 'completed' || t.status === 'cancelled').length;
        const meta = document.createElement('div');
        meta.style.color = '#6b7280';
        meta.style.fontSize = '0.8rem';
        meta.textContent = `เสร็จแล้ว ${doneCount}/${todos.length}`;
        tile.appendChild(meta);

        const list = document.createElement('div');
        list.style.display = 'grid';
        list.style.gap = '0.4rem';
        todos
            .slice()
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .slice(0, 4)
            .forEach(todo => {
                const item = document.createElement('div');
                item.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:0.5rem;">
            <span>${escapeHtml(todo.title || '-')}</span>
            <span style="color:#9ca3af;font-size:0.75rem;">${formatTodoStatus(todo.status)}</span>
          </div>
        `;
                list.appendChild(item);
            });
        tile.appendChild(list);

        if (todos.length > 4) {
            const more = document.createElement('div');
            more.style.color = '#9ca3af';
            more.style.fontSize = '0.75rem';
            more.textContent = `+อีก ${todos.length - 4} งาน`;
            tile.appendChild(more);
        }

        grid.appendChild(tile);
    });

    if (grouped.has('uncategorized')) {
        const todos = grouped.get('uncategorized');
        if (todos && todos.length) {
            const tile = document.createElement('div');
            tile.className = 'todo-city-tile';

            const title = document.createElement('div');
            title.className = 'todo-city-title';
            title.textContent = '• ไม่ระบุหมวด';
            tile.appendChild(title);

            const list = document.createElement('div');
            list.style.display = 'grid';
            list.style.gap = '0.4rem';
            todos.slice(0, 4).forEach(todo => {
                const item = document.createElement('div');
                item.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:0.5rem;">
            <span>${escapeHtml(todo.title || '-')}</span>
            <span style="color:#9ca3af;font-size:0.75rem;">${formatTodoStatus(todo.status)}</span>
          </div>
        `;
                list.appendChild(item);
            });
            tile.appendChild(list);
            grid.appendChild(tile);
        }
    }

    wrap.appendChild(grid);
}

function renderFloorView(filteredTodos) {
    const wrap = document.getElementById('todo-view-floor');
    if (!wrap) return;
    wrap.innerHTML = '';

    const categoryMap = new Map(allCategories.map(cat => [String(cat.id), cat]));
    const zones = [
        { key: 'structure', title: 'โครงสร้าง', keywords: ['structure', 'structural', 'foundation', 'roof', 'floor', 'wall', 'โครงสร้าง', 'หลังคา', 'พื้น', 'ผนัง'] },
        { key: 'systems', title: 'ระบบ', keywords: ['plumbing', 'electrical', 'hvac', 'ไฟฟ้า', 'ประปา', 'สุขาภิบาล', 'ท่อ'] },
        { key: 'wet', title: 'พื้นที่เปียก', keywords: ['bath', 'toilet', 'ห้องน้ำ', 'สุขา'] },
        { key: 'kitchen', title: 'ครัว', keywords: ['kitchen', 'ครัว'] },
        { key: 'interior', title: 'งานตกแต่งภายใน', keywords: ['interior', 'finish', 'paint', 'สี', 'ตกแต่ง', 'เฟอร์', 'built', 'บิ้ว', 'ตกแต่ง'] },
        { key: 'exterior', title: 'งานภายนอก', keywords: ['exterior', 'garden', 'yard', 'facade', 'ภายนอก', 'สวน', 'รั้ว'] }
    ];

    const zoneBuckets = new Map(zones.map(zone => [zone.key, []]));
    const otherBucket = [];

    const findZoneKey = (label) => {
        const name = (label || '').toLowerCase();
        for (const zone of zones) {
            if (zone.keywords.some(keyword => name.includes(keyword))) {
                return zone.key;
            }
        }
        return null;
    };

    filteredTodos.forEach(todo => {
        const cat = categoryMap.get(String(todo.category_id));
        const catLabel = cat ? `${cat.name || ''}` : '';
        const zoneKey = findZoneKey(catLabel);
        if (zoneKey && zoneBuckets.has(zoneKey)) {
            zoneBuckets.get(zoneKey).push(todo);
        } else {
            otherBucket.push(todo);
        }
    });

    const grid = document.createElement('div');
    grid.className = 'todo-floor-grid';

    zones.forEach(zone => {
        const list = zoneBuckets.get(zone.key) || [];
        if (!list.length) return;
        const panel = document.createElement('div');
        panel.className = 'todo-floor-zone';
        panel.innerHTML = `<h4>${zone.title}</h4>`;

        list
            .slice()
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .forEach(todo => {
                const cat = categoryMap.get(String(todo.category_id));
                const item = document.createElement('div');
                item.innerHTML = `
          <div style="font-weight:600;">${escapeHtml(todo.title || '-')}</div>
          <div style="color:#9ca3af;font-size:0.75rem;">${formatTodoStatus(todo.status)}${cat ? ` • ${escapeHtml(cat.name || '')}` : ''}</div>
        `;
                panel.appendChild(item);
            });

        grid.appendChild(panel);
    });

    if (otherBucket.length) {
        const panel = document.createElement('div');
        panel.className = 'todo-floor-zone';
        panel.innerHTML = '<h4>อื่นๆ</h4>';
        otherBucket.forEach(todo => {
            const item = document.createElement('div');
            item.innerHTML = `
        <div style="font-weight:600;">${escapeHtml(todo.title || '-')}</div>
        <div style="color:#9ca3af;font-size:0.75rem;">${formatTodoStatus(todo.status)}</div>
      `;
            panel.appendChild(item);
        });
        grid.appendChild(panel);
    }

    wrap.appendChild(grid);
}

function buildContractorLookup(list = []) {
    contractorLookup = new Map();
    list.forEach(row => {
        const contractor = row.contractor || row.contractors || row.contractor_id;
        const contractorId = row.contractor_id || contractor?.id;
        if (!contractorId) return;
        contractorLookup.set(String(contractorId), {
            name: contractor?.name || row.contractor_name || 'ทีมช่าง',
            trade: contractor?.trade || row.trade || ''
        });
    });
}

async function loadContractorsForProperty() {
    if (!currentPropertyId) return;
    try {
        const list = await listContractorsForProperty(currentPropertyId);
        currentPropertyContractors = list || [];
        buildContractorLookup(currentPropertyContractors);
        populateContractorSelect();
    } catch (err) {
        console.error('Load contractors failed', err);
        currentPropertyContractors = [];
        contractorLookup = new Map();
        populateContractorSelect();
    }
}

function populateContractorSelect() {
    const select = document.getElementById('todo-contractor');
    if (!select) return;
    clear(select);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '-- เลือกทีมช่าง --';
    select.appendChild(empty);

    const seen = new Set();
    currentPropertyContractors.forEach(row => {
        const contractor = row.contractor || row.contractors;
        if (!contractor?.id || seen.has(contractor.id)) return;
        seen.add(contractor.id);
        const option = document.createElement('option');
        option.value = contractor.id;
        option.textContent = contractor.trade
            ? `${contractor.name} (${contractor.trade})`
            : contractor.name;
        select.appendChild(option);
    });
}

async function loadPhaseSettings() {
    if (!currentPropertyId) return;
    const { data, error } = await getPhaseLockSetting(currentPropertyId);
    if (error) {
        const fallback = localStorage.getItem(`todoPhaseLock:${currentPropertyId}`);
        phaseLockEnabled = fallback === 'true';
    } else {
        phaseLockEnabled = !!data?.lock_enabled;
        localStorage.setItem(`todoPhaseLock:${currentPropertyId}`, phaseLockEnabled ? 'true' : 'false');
    }
    const toggle = document.getElementById('todo-phase-lock-toggle');
    if (toggle) toggle.checked = phaseLockEnabled;
}

async function persistPhaseLockSetting() {
    if (!currentPropertyId) return;
    const { error } = await savePhaseLockSetting(currentPropertyId, phaseLockEnabled);
    if (error) {
        localStorage.setItem(`todoPhaseLock:${currentPropertyId}`, phaseLockEnabled ? 'true' : 'false');
    }
}

function getPhaseKeyByCategory(categoryName = '') {
    const name = categoryName.toLowerCase();
    if (/(admin|เอกสาร|เตรียม|pre|plan)/i.test(name)) return 'prep';
    if (/(structure|struct|หลังคา|โครงสร้าง|รื้อ|ถอน|พื้น|ผนัง)/i.test(name)) return 'structure';
    if (/(ไฟฟ้า|ประปา|ระบบ|plumbing|electrical|system|สุขาภิบาล)/i.test(name)) return 'systems';
    if (/(ตกแต่ง|สี|เฟอร์|finish|interior|บิ้ว)/i.test(name)) return 'finishes';
    if (/(ภายนอก|สวน|รั้ว|exterior|external)/i.test(name)) return 'exterior';
    return 'other';
}

function getTodoPhaseKey(todo) {
    const cat = allCategories.find(c => String(c.id) === String(todo.category_id));
    const catName = cat?.name || todo?.category?.name || '';
    return getPhaseKeyByCategory(catName);
}

function computePhaseStatus(todos = allTodos) {
    const stats = new Map(PHASES.map(p => [p.key, { total: 0, done: 0 }]));
    todos.forEach(todo => {
        const key = getTodoPhaseKey(todo);
        const entry = stats.get(key);
        if (!entry) return;
        entry.total += 1;
        if (todo.status === 'completed' || todo.status === 'cancelled') {
            entry.done += 1;
        }
    });

    const phaseOrder = PHASES.filter(p => p.key !== 'other').map(p => p.key);
    let currentIndex = -1;
    phaseOrder.some((key, idx) => {
        const entry = stats.get(key);
        if (!entry || entry.total === 0) return false;
        if (entry.done < entry.total) {
            currentIndex = idx;
            return true;
        }
        return false;
    });

    phaseStatusCache = {
        stats,
        currentIndex,
        phaseOrder
    };
}

function isTodoPhaseLocked(todo) {
    return false;
}

function renderPhaseOverview() {
    const list = document.getElementById('todo-phase-list');
    if (!list) return;
    computePhaseStatus();
    list.innerHTML = '';

    PHASES.forEach(phase => {
        const entry = phaseStatusCache.stats.get(phase.key) || { total: 0, done: 0 };
        if (entry.total === 0) return;
        const percent = entry.total ? Math.round((entry.done / entry.total) * 100) : 0;
        const phaseIndex = phaseStatusCache.phaseOrder.indexOf(phase.key);
        const isLocked = phaseLockEnabled && phase.key !== 'other' && phaseIndex > phaseStatusCache.currentIndex && phaseStatusCache.currentIndex !== -1;
        const statusText = entry.done === entry.total ? 'จบเฟส' : isLocked ? 'ล็อก' : 'กำลังทำ';
        const statusColor = entry.done === entry.total ? '#16a34a' : isLocked ? '#9ca3af' : '#d97706';

        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr 60px';
        row.style.alignItems = 'center';
        row.style.gap = '0.5rem';
        row.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
          <strong>${phase.label}</strong>
          <span style="font-size:12px; color:${statusColor}; font-weight:600;">${statusText}</span>
        </div>
        <div style="height:6px; background:#f3f4f6; border-radius:999px; overflow:hidden;">
          <span style="display:block; height:100%; width:${percent}%; background:${statusColor};"></span>
        </div>
        <span style="font-size:12px; color:#6b7280;">${entry.done}/${entry.total} งาน</span>
      </div>
      <div style="font-size:12px; color:#6b7280; text-align:right;">${percent}%</div>
    `;
        list.appendChild(row);
    });
}

function computeTodoDepths(todos = allTodos) {
    const memo = new Map();
    todos.forEach(todo => {
        memo.set(String(todo.id), 1);
    });
    return memo;
}

function renderCriticalPath() {
    const list = document.getElementById('todo-critical-list');
    if (!list) return;
    list.innerHTML = '';

    if (!allTodos.length) {
        list.innerHTML = '<div style="color:#9ca3af;">ยังไม่มีงาน</div>';
        return;
    }

    const depths = computeTodoDepths(allTodos);
    const activeTodos = allTodos.filter(todo => !['completed', 'cancelled'].includes(todo.status));
    const sorted = activeTodos
        .slice()
        .sort((a, b) => {
            const da = depths.get(String(a.id)) || 0;
            const db = depths.get(String(b.id)) || 0;
            if (da !== db) return db - da;
            const aDate = a.due_date ? new Date(a.due_date) : new Date(8640000000000000);
            const bDate = b.due_date ? new Date(b.due_date) : new Date(8640000000000000);
            return aDate - bDate;
        })
        .slice(0, 6);

    if (!sorted.length) {
        list.innerHTML = '<div style="color:#9ca3af;">งานทั้งหมดเสร็จแล้ว</div>';
        return;
    }

    sorted.forEach(todo => {
        const depth = depths.get(String(todo.id)) || 1;
        const overdueDays = todo.due_date && isOverdue(todo.due_date)
            ? Math.ceil((Date.now() - new Date(todo.due_date).getTime()) / 86400000)
            : 0;
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr auto';
        row.style.gap = '0.5rem';
        row.style.padding = '0.4rem 0';
        row.innerHTML = `
      <div>
        <div style="font-weight:600;">${escapeHtml(todo.title || '-')}</div>
        <div style="font-size:12px; color:#6b7280;">ลำดับ ${depth}${todo.due_date ? ` • กำหนด ${formatDate(todo.due_date)}` : ''}${overdueDays ? ` • ช้า ${overdueDays} วัน` : ''}</div>
      </div>
      <div style="font-size:12px; color:${overdueDays ? '#dc2626' : '#6b7280'}; font-weight:600;">${formatTodoStatus(todo.status)}</div>
    `;
        list.appendChild(row);
    });
}

function parseLinkList(raw) {
    if (!raw) return [];
    return String(raw)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}

function getTodoActualCost(todoId) {
    const list = purchaseSummaryCache[todoId] || [];
    if (!list.length) return 0;
    return list.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        return sum + (qty * price);
    }, 0);
}

function updateTodoBudgetLine(todoId) {
    const el = document.querySelector(`[data-todo-budget="${todoId}"]`);
    if (!el) return;
    const todo = allTodos.find(t => String(t.id) === String(todoId));
    if (!todo) return;
    const estimate = Number(todo.budget_estimate) || 0;
    const actual = getTodoActualCost(todoId);
    const text = estimate
        ? `งบ ${formatCurrency(estimate)} / ใช้จริง ${formatCurrency(actual)}`
        : `ใช้จริง ${formatCurrency(actual)}`;
    el.textContent = text;
}

function refreshBudgetSummary() {
    const target = document.getElementById('todo-budget-summary');
    if (!target) return;
    const planned = allTodos.reduce((sum, todo) => sum + (Number(todo.budget_estimate) || 0), 0);
    let actual = 0;
    Object.keys(purchaseSummaryCache).forEach(todoId => {
        actual += getTodoActualCost(todoId);
    });
    if (!planned && !actual) {
        target.textContent = '';
        return;
    }
    target.textContent = `งบรวม ${formatCurrency(planned)} • ใช้จริง ${formatCurrency(actual)}`;
}

/**
 * Create a category section with todos
 */
function createCategorySection(category, todos) {
    const section = document.createElement('div');
    section.className = 'todo-category-section';

    const header = document.createElement('div');
    header.className = 'todo-category-header';

    const iconEl = document.createElement('span');
    iconEl.className = 'todo-category-icon';
    iconEl.textContent = category?.icon || '📌';

    const titleEl = document.createElement('h4');
    titleEl.className = 'todo-category-title';
    titleEl.textContent = category?.name || 'ไม่มีหมวดหมู่';

    const countEl = document.createElement('span');
    countEl.className = 'todo-category-count';
    countEl.textContent = `${todos.length}`;

    header.appendChild(iconEl);
    header.appendChild(titleEl);
    header.appendChild(countEl);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'todo-items';

    todos.forEach(todo => {
        const item = createTodoItem(todo);
        itemsContainer.appendChild(item);
    });

    section.appendChild(header);
    section.appendChild(itemsContainer);

    return section;
}

/**
 * Create a todo item card
 */
function createTodoItem(todo) {
    const isCancelled = todo.status === 'cancelled';
    const item = document.createElement('div');
    const isCompleted = todo.status === 'completed';
    const isPhaseLocked = isTodoPhaseLocked(todo);
    const isBlocked = !isCompleted && !isCancelled && isPhaseLocked;

    const contractor = todo.contractor_id ? contractorLookup.get(String(todo.contractor_id)) : null;
    const assigneeText = contractor
        ? `${contractor.name}${contractor.trade ? ` (${contractor.trade})` : ''}`
        : (todo.assignee_name || '');
    const evidenceCount = parseLinkList(todo.evidence_links).length;
    const beforeCount = parseLinkList(todo.before_links).length;
    const afterCount = parseLinkList(todo.after_links).length;

    item.className = `todo-item ${isCompleted ? 'completed' : ''} ${isCancelled ? 'cancelled' : ''} ${isBlocked ? 'locked' : ''}`;
    item.dataset.id = todo.id;

    const phaseNote = isPhaseLocked ? 'ล็อกตามเฟสงาน' : '';

    item.innerHTML = `
     <div class="todo-checkbox ${isCompleted ? 'checked' : ''} ${isBlocked ? 'disabled' : ''}" data-id="${todo.id}"></div>
  <div class="todo-content">
    <div class="todo-title">${escapeHtml(todo.title)}</div>
    ${todo.description ? `<div class="todo-description">${escapeHtml(todo.description)}</div>` : ''}
    ${phaseNote ? `<div class="todo-meta"><span class="todo-phase-lock-badge" title="${phaseNote}">🔒 ${phaseNote}</span></div>` : ''}
    <div class="todo-meta">
      <span class="todo-priority ${todo.priority}">${getPriorityText(todo.priority)}</span>
      ${todo.due_date ? `<span class="todo-due-date ${isOverdue(todo.due_date) ? 'overdue' : ''}">📅 ${formatDate(todo.due_date)}</span>` : ''}
      ${todo.reminder_date ? `<span class="todo-reminder">🔔 ${formatDateTime(todo.reminder_date)}</span>` : ''}
    </div>
    ${assigneeText ? `<div class="todo-meta" style="font-size:12px;color:#6b7280;">ผู้รับผิดชอบ: ${escapeHtml(assigneeText)}</div>` : ''}
    <div class="todo-meta" style="font-size:12px;color:#6b7280;" data-todo-budget="${todo.id}"></div>
    ${(evidenceCount || beforeCount || afterCount) ? `
      <div class="todo-meta" style="font-size:12px;color:#6b7280;">
        ลิงก์: หลักฐาน ${evidenceCount} • ก่อน ${beforeCount} • หลัง ${afterCount}
      </div>` : ''}
    <div class="todo-meta" style="margin-top:4px;">
      <button class="todo-action-btn purchase" data-id="${todo.id}" title="ของที่ต้องซื้อ" style="font-size: 13px; padding:4px 8px; border:1px solid #e5e7eb; border-radius:6px; background:#fff;">🛒 จัดการของ</button>
    </div>
  </div>
  <div class="todo-actions">
      <button class="todo-action-btn edit" data-id="${todo.id}" title="แก้ไข">✏️</button>
      <div class="todo-move-controls" style="display: flex; flex-direction: column; gap: 2px; margin-right: 5px;">
        <button class="todo-move-btn up" data-id="${todo.id}" title="เลื่อนขึ้น" style="font-size: 10px; padding: 2px 6px; border: 1px solid #ddd; background: #fff; cursor: pointer; border-radius: 4px;">▲</button>
        <button class="todo-move-btn down" data-id="${todo.id}" title="เลื่อนลง" style="font-size: 10px; padding: 2px 6px; border: 1px solid #ddd; background: #fff; cursor: pointer; border-radius: 4px;">▼</button>
      </div>
      <button class="todo-action-btn delete" data-id="${todo.id}" title="ลบ">🗑️</button>
      <div class="todo-drag-handle" title="ลากเพื่อย้าย" style="touch-action: none;">⋮⋮</div>
    </div>
  `;

    // Add event listeners
    const checkbox = item.querySelector('.todo-checkbox');
    if (!isBlocked) {
        checkbox.addEventListener('click', () => handleToggleStatus(todo.id, todo.status));
    } else {
        checkbox.title = 'งานนี้ถูกล็อกตามเฟสงาน';
    }

    const editBtn = item.querySelector('.edit');
    editBtn.addEventListener('click', () => openTodoModal(todo));

    const purchaseBtn = item.querySelector('.purchase');
    if (purchaseBtn) purchaseBtn.addEventListener('click', () => openPurchaseModal(todo));

    // Purchase summary badge
    const purchaseSummary = document.createElement('div');
    purchaseSummary.className = 'todo-purchase-summary';
    purchaseSummary.dataset.purchaseSummary = todo.id;
    purchaseSummary.style.cssText = 'font-size:12px;color:#6b7280;';
    purchaseSummary.textContent = '🛒 โหลดข้อมูลการซื้อ...';

    const purchaseInline = document.createElement('div');
    purchaseInline.dataset.purchaseInline = todo.id;
    purchaseInline.style.cssText = 'margin-top:2px;font-size:12px;color:#374151;';

    const purchaseBlock = document.createElement('div');
    purchaseBlock.style.cssText = 'margin-top:6px;padding:8px;border:1px dashed #e5e7eb;border-radius:8px;background:#f9fafb;';
    purchaseBlock.innerHTML = `<div style="font-weight:600;font-size:12px;color:#111;">ของที่จะซื้อ</div>`;
    purchaseBlock.appendChild(purchaseSummary);
    purchaseBlock.appendChild(purchaseInline);

    item.querySelector('.todo-content')?.appendChild(purchaseBlock);
    loadPurchaseSummary(todo.id, purchaseSummary);
    updateTodoBudgetLine(todo.id);

    // Move Up/Down Listeners
    const moveUpBtn = item.querySelector('.todo-move-btn.up');
    const moveDownBtn = item.querySelector('.todo-move-btn.down');

    if (moveUpBtn) moveUpBtn.addEventListener('click', (e) => handleMoveTodo(e, todo.id, 'up'));
    if (moveDownBtn) moveDownBtn.addEventListener('click', (e) => handleMoveTodo(e, todo.id, 'down'));

    const deleteBtn = item.querySelector('.delete');
    deleteBtn.addEventListener('click', () => handleDeleteTodo(todo.id));

    // Fix for mobile drag: Relying on CSS touch-action: none and Sortable delay.
    // Manual listeners removed to allow Sortable to handle events.

    return item;
}

/**
 * Handle toggle todo status
 */
async function handleToggleStatus(todoId, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

    if (newStatus === 'completed') {
        const todo = allTodos.find(t => t.id === todoId);
        if (todo && isTodoPhaseLocked(todo)) {
            toast('งานนี้ถูกล็อกตามเฟสงาน กรุณาทำเฟสก่อนหน้าให้เสร็จก่อน', 2500, 'error');
            return;
        }
    }

    const { data, error } = await toggleTodoStatus(todoId, newStatus);

    if (error) {
        console.error('Error toggling status:', error);
        toast('ไม่สามารถอัปเดตสถานะได้', 3000, 'error');
        return;
    }

    // Update local state
    const todoIndex = allTodos.findIndex(t => t.id === todoId);
    if (todoIndex !== -1) {
        allTodos[todoIndex] = data;
    }

    renderTodos();
    updateStats();

    if (newStatus === 'completed') {
        toast('✅ ทำงานเสร็จแล้ว!', 2000, 'success');
    }
}

/**
 * Handle delete/skip button click
 */
function handleDeleteTodo(todoId) {
    currentActionTodoId = todoId;
    openActionModal();
}

/**
 * Real Delete (after confirmation from new modal)
 */
async function handleConfirmDelete() {
    if (!currentActionTodoId) return;

    console.log('Attempting to delete from DB:', currentActionTodoId);
    const { error } = await deleteTodo(currentActionTodoId);

    if (error) {
        console.error('Error deleting todo:', error);
        toast('ไม่สามารถลบงานได้: ' + error.message, 3000, 'error');
        return;
    }

    // Remove from local state
    allTodos = allTodos.filter(t => t.id !== currentActionTodoId);

    renderTodos();
    updateStats();
    toast('ลบงานเรียบร้อย', 2000, 'success');
    closeActionModal();
}

/**
 * Handle Skip (Cancel) Todo
 */
async function handleSkipTodo(reason) {
    if (!currentActionTodoId) return;

    // 1. Fetch current todo to get existing description
    const todo = allTodos.find(t => t.id === currentActionTodoId);
    if (!todo) return;

    // 2. Append reason to description
    const newDescription = (todo.description || '') + `\n\n[เหตุผลที่ไม่ทำ: ${reason}]`;

    // 3. Update status to 'cancelled'
    const updates = {
        status: 'cancelled',
        description: newDescription
    };

    const { data, error } = await updateTodo(currentActionTodoId, updates);

    if (error) {
        console.error('Error skipping todo:', error);
        toast('ไม่สามารถบันทึกข้อมูลได้', 3000, 'error');
        return;
    }

    // 4. Update local state
    const index = allTodos.findIndex(t => t.id === currentActionTodoId);
    if (index !== -1) {
        allTodos[index] = data;
    }

    renderTodos();
    updateStats();
    toast('บันทึกการยกเลิกงานเรียบร้อย', 2000, 'success');
    closeActionModal();
}

/**
 * Initialize Action Modal (Delete/Skip)
 */
function initActionModal() {
    actionModal = document.getElementById('todo-action-modal');

    // Close buttons
    const closeBtn = document.getElementById('todo-action-close');
    if (closeBtn) closeBtn.addEventListener('click', closeActionModal);

    // Choice Buttons
    const btnDelete = document.getElementById('btn-choice-delete');
    const btnSkip = document.getElementById('btn-choice-skip');

    // Skip Form
    const skipContainer = document.getElementById('skip-reason-container');
    const btnSkipCancel = document.getElementById('btn-skip-cancel');
    const btnSkipConfirm = document.getElementById('btn-skip-confirm');
    const skipInput = document.getElementById('skip-reason-input');

    if (btnDelete) {
        btnDelete.addEventListener('click', async () => {
            // Confirm again for permanent delete? Or just do it?
            // The modal itself acts as a choice, but permanent delete is refined.
            // Let's verify with the standard confirm just to be safe, or just do it.
            // Given the UI, clicking "Delete Permanently" is an explicit action.
            // But let's add a small confirm to be safe.
            const sure = await showConfirmModal('ยืนยันลบถาวร? ข้อมูลจะหายไปทันที');
            if (sure) {
                handleConfirmDelete();
            }
        });
    }

    if (btnSkip) {
        btnSkip.addEventListener('click', () => {
            // Show reason input
            if (skipContainer) skipContainer.style.display = 'block';
            // Hide choices if we want, or just expand. Let's scroll to it.
            skipInput.focus();
        });
    }

    if (btnSkipCancel) {
        btnSkipCancel.addEventListener('click', () => {
            if (skipContainer) skipContainer.style.display = 'none';
            if (skipInput) skipInput.value = '';
        });
    }

    if (btnSkipConfirm) {
        btnSkipConfirm.addEventListener('click', () => {
            const reason = skipInput.value.trim();
            if (!reason) {
                toast('กรุณาระบุเหตุผล', 2000, 'warning');
                return;
            }
            handleSkipTodo(reason);
        });
    }

    // Close on click outside
    if (actionModal) {
        actionModal.addEventListener('click', (e) => {
            if (e.target === actionModal) {
                closeActionModal();
            }
        });
    }
}

function initPurchaseModal() {
    purchaseModal = document.getElementById('todo-purchase-modal');
    if (!purchaseModal) return;
    purchaseModal.addEventListener('click', (e) => {
        if (e.target === purchaseModal) closePurchaseModal();
    });
}

function initPurchaseOverviewModal() {
    purchaseOverviewModal = document.getElementById('purchase-overview-modal');
    if (!purchaseOverviewModal) return;
    const closeBtn = document.getElementById('purchase-overview-close');
    if (closeBtn) closeBtn.addEventListener('click', closePurchaseOverviewModal);
    purchaseOverviewModal.addEventListener('click', (e) => {
        if (e.target === purchaseOverviewModal) closePurchaseOverviewModal();
    });
    const printBtn = document.getElementById('purchase-overview-print');
    if (printBtn) {
        printBtn.addEventListener('click', handlePrintPurchaseOverview);
    }
    const exportBtn = document.getElementById('purchase-overview-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportPurchases);
    }
}

function openActionModal() {
    if (actionModal) {
        actionModal.classList.add('open');
        // Reset state
        const skipContainer = document.getElementById('skip-reason-container');
        const skipInput = document.getElementById('skip-reason-input');
        if (skipContainer) skipContainer.style.display = 'none';
        if (skipInput) skipInput.value = '';
    }
}

function closeActionModal() {
    if (actionModal) {
        actionModal.classList.remove('open');
    }
    currentActionTodoId = null;
}

function openPurchaseModal(todo) {
    currentPurchaseTodoId = todo.id;
    const titleEl = document.getElementById('todo-purchase-title');
    if (titleEl) titleEl.textContent = `รายการซื้อของ: ${todo.title}`;
    renderPurchaseFormDefaults();
    renderPurchaseListPlaceholder();
    if (purchaseModal) purchaseModal.classList.add('open');
    loadPurchaseItems(todo.id);
}

function closePurchaseModal() {
    if (purchaseModal) purchaseModal.classList.remove('open');
    currentPurchaseTodoId = null;
    currentPurchaseItems = [];
}

function renderPurchaseFormDefaults() {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    setVal('purchase-title', '');
    setVal('purchase-vendor', '');
    setVal('purchase-qty', '');
    setVal('purchase-unit', '');
    setVal('purchase-unit-price', '');
    setVal('purchase-due', '');
    setVal('purchase-status', 'pending');
    setVal('purchase-note', '');
}

function renderPurchaseListPlaceholder() {
    const list = document.getElementById('todo-purchase-list');
    if (list) list.innerHTML = '<small style="color:#6b7280;">กำลังโหลด...</small>';
    const summary = document.getElementById('todo-purchase-summary');
    if (summary) summary.textContent = '';
}

async function loadPurchaseItems(todoId) {
    try {
        const list = await listPurchasesByTodo(todoId);
        currentPurchaseItems = list || [];
        renderPurchaseList();
        const badge = document.querySelector(`.todo-purchase-summary[data-purchase-summary="${todoId}"]`);
        if (badge) loadPurchaseSummary(todoId, badge, list);
        loadPurchaseOverview();
    } catch (err) {
        console.error('Load purchases failed', err);
        const listEl = document.getElementById('todo-purchase-list');
        if (listEl) listEl.innerHTML = '<small style="color:#dc2626;">โหลดรายการซื้อไม่สำเร็จ</small>';
    }
}

function renderPurchaseList() {
    const listEl = document.getElementById('todo-purchase-list');
    const summaryEl = document.getElementById('todo-purchase-summary');
    if (!listEl) return;

    const sum = (arr, fn) => arr.filter(fn).reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0);
    const total = sum(currentPurchaseItems, () => true);
    const paid = sum(currentPurchaseItems, i => i.status === 'paid');
    const pending = total - paid;

    if (summaryEl) {
        summaryEl.innerHTML = `
          <span style="margin-right:8px;">รวม: ${formatCurrency(total)}</span>
          <span style="color:#16a34a;margin-right:8px;">จ่ายแล้ว: ${formatCurrency(paid)}</span>
          <span style="color:#f59e0b;">ค้าง: ${formatCurrency(pending)}</span>
        `;
    }

    if (!currentPurchaseItems.length) {
        listEl.innerHTML = '<small style="color:#9ca3af;">ยังไม่มีรายการซื้อ</small>';
        return;
    }

    const table = document.createElement('div');
    table.style.display = 'flex';
    table.style.flexDirection = 'column';
    table.style.gap = '8px';

    currentPurchaseItems.forEach(item => {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        const totalItem = qty * unitPrice;
        const fmtDate = (d) => {
            if (!d) return '-';
            const date = new Date(d);
            if (isNaN(date)) return '-';
            return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
        };
        const badge = (status) => {
            const color = {
                pending: '#f59e0b',
                ordered: '#3b82f6',
                received: '#0ea5e9',
                paid: '#16a34a',
                void: '#6b7280'
            }[status] || '#6b7280';
            const text = {
                pending: 'รอดำเนินการ',
                ordered: 'สั่งซื้อแล้ว',
                received: 'ได้รับของแล้ว',
                paid: 'จ่ายแล้ว',
                void: 'ยกเลิก'
            }[status] || status;
            return `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:999px;font-size:12px;">${text}</span>`;
        };

        const row = document.createElement('div');
        row.style.border = '1px solid #e5e7eb';
        row.style.borderRadius = '8px';
        row.style.padding = '8px 10px';
        row.style.background = '#fff';
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <div style="font-weight:700;font-size:13px;">${escapeHtml(item.title || '')}</div>
            ${badge(item.status)}
          </div>
          <div style="margin-top:2px;font-size:12px;">ร้าน: ${escapeHtml(item.vendor || '-')}</div>
          <div style="margin-top:2px;font-size:12px;">จำนวน: ${qty} ${escapeHtml(item.unit || '')} @ ${formatCurrency(unitPrice)} = <b>${formatCurrency(totalItem)}</b></div>
          <div style="margin-top:2px;font-size:12px;">กำหนด: ${fmtDate(item.due_date)}</div>
          ${item.note ? `<div style="margin-top:4px;font-size:12px;color:#4b5563;">${escapeHtml(item.note)}</div>` : ''}
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
            ${item.status !== 'paid' ? `<button class="btn btn-sm mark-purchase" data-id="${item.id}" data-status="paid" style="background:#16a34a;color:#fff;border:none;padding:5px 8px;font-size:12px;">จ่ายแล้ว</button>` : ''}
            ${item.status !== 'received' && item.status !== 'paid' ? `<button class="btn btn-sm mark-purchase" data-id="${item.id}" data-status="received" style="padding:5px 8px;font-size:12px;">รับของแล้ว</button>` : ''}
            <button class="btn btn-sm btn-secondary delete-purchase" data-id="${item.id}" style="padding:5px 8px;font-size:12px;">ลบ</button>
          </div>
        `;
        table.appendChild(row);
    });

    listEl.innerHTML = '';
    listEl.appendChild(table);

    listEl.querySelectorAll('.mark-purchase').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            const status = e.currentTarget.dataset.status;
            try {
                await updatePurchaseStatus(id, status);
                await loadPurchaseItems(currentPurchaseTodoId);
                toast('อัปเดตสถานะแล้ว', 2000, 'success');
            } catch (err) {
                console.error(err);
                toast('ไม่สามารถอัปเดตได้', 2500, 'error');
            }
        });
    });

    listEl.querySelectorAll('.delete-purchase').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (!confirm('ลบรายการซื้อ?')) return;
            try {
                await deletePurchaseItem(id);
                await loadPurchaseItems(currentPurchaseTodoId);
                toast('ลบเรียบร้อย', 2000, 'success');
            } catch (err) {
                console.error(err);
                toast('ลบไม่สำเร็จ', 2500, 'error');
            }
        });
    });
}

async function handleSavePurchase() {
    if (!currentPurchaseTodoId || !currentPropertyId) {
        toast('กรุณาเลือกงานและบ้านก่อน', 2000, 'warning');
        return;
    }
    const title = document.getElementById('purchase-title')?.value.trim();
    if (!title) {
        toast('กรุณากรอกชื่อของ', 2000, 'warning');
        return;
    }
    const payload = {
        todo_id: currentPurchaseTodoId,
        property_id: currentPropertyId,
        title,
        vendor: document.getElementById('purchase-vendor')?.value.trim(),
        quantity: parseFloat(document.getElementById('purchase-qty')?.value || '0') || null,
        unit: document.getElementById('purchase-unit')?.value.trim(),
        unit_price: parseFloat(document.getElementById('purchase-unit-price')?.value || '0') || null,
        due_date: document.getElementById('purchase-due')?.value || null,
        status: document.getElementById('purchase-status')?.value || 'pending',
        note: document.getElementById('purchase-note')?.value.trim()
    };
    try {
        await upsertPurchaseItem(payload);
        renderPurchaseFormDefaults();
        await loadPurchaseItems(currentPurchaseTodoId);
        toast('บันทึกรายการซื้อแล้ว', 2000, 'success');
    } catch (err) {
        console.error(err);
        toast('ไม่สามารถบันทึกได้', 2500, 'error');
    }
}

async function loadPurchaseSummary(todoId, targetEl, preloadList = null) {
    try {
        const list = preloadList || await listPurchasesByTodo(todoId);
        purchaseSummaryCache[todoId] = list;
        const sum = (arr, fn) => arr.filter(fn).reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0);
        const total = sum(list, () => true);
        const paid = sum(list, i => i.status === 'paid');
        const now = new Date();
        const overdue = sum(list, i => i.status !== 'paid' && i.due_date && new Date(i.due_date) < now);
        const pending = total - paid;
        const text = `🛒 ${list.length} รายการ | จ่ายแล้ว ${formatCurrency(paid)} | ค้าง ${formatCurrency(pending)}${overdue > 0 ? ` | เกินกำหนด ${formatCurrency(overdue)}` : ''}`;
        targetEl.textContent = text;
        targetEl.style.color = overdue > 0 ? '#dc2626' : '#374151';
        renderPurchaseInline(todoId);
        updateTodoBudgetLine(todoId);
        refreshBudgetSummary();
    } catch (err) {
        console.error('Load purchase summary failed', err);
        targetEl.textContent = '🛒 โหลดข้อมูลไม่ได้';
        targetEl.style.color = '#dc2626';
    }
}

function renderPurchaseInline(todoId) {
    const target = document.querySelector(`[data-purchase-inline="${todoId}"]`);
    if (!target) return;
    const list = purchaseSummaryCache[todoId] || [];
    if (!list.length) {
        target.innerHTML = '<div style="color:#9ca3af;">ยังไม่มีรายการซื้อ</div>';
        return;
    }
    const items = list.slice(0, 3).map(i => {
        const qty = Number(i.quantity) || 0;
        const unit = i.unit || '';
        const vendor = i.vendor ? ` • ${escapeHtml(i.vendor)}` : '';
        return `<div style="display:flex;gap:6px;align-items:center;">
          <span style="font-size:13px;">${escapeHtml(i.title || '')}</span>
          <span style="color:#6b7280;font-size:12px;">(${qty || ''} ${escapeHtml(unit)})${vendor}</span>
        </div>`;
    }).join('');
    const more = list.length > 3 ? `<div style="color:#6b7280;font-size:12px;">… อีก ${list.length - 3} รายการ</div>` : '';
    target.innerHTML = items + more;
}

async function loadPurchaseOverview() {
    const block = document.getElementById('todo-purchase-overview');
    const content = document.getElementById('todo-purchase-overview-content');
    const summaryEl = document.getElementById('todo-purchase-overview-summary');
    if (!block || !content) return;
    if (!currentPropertyId) {
        block.style.display = 'none';
        return;
    }
    block.style.display = 'block';
    content.innerHTML = '<small style="color:#6b7280;">กำลังโหลด...</small>';
    if (summaryEl) summaryEl.textContent = '';

    try {
        const list = await listPurchasesByProperty(currentPropertyId);
        if (!list.length) {
            content.innerHTML = '<small style="color:#9ca3af;">ยังไม่มีรายการซื้อ</small>';
            return;
        }
        const sum = (arr, fn) => arr.filter(fn).reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0);
        const total = sum(list, () => true);
        const paid = sum(list, i => i.status === 'paid');
        const now = new Date();
        const overdue = sum(list, i => i.status !== 'paid' && i.due_date && new Date(i.due_date) < now);
        const pending = total - paid;
        if (summaryEl) {
            summaryEl.textContent = `รวม ${formatCurrency(total)} | จ่ายแล้ว ${formatCurrency(paid)} | ค้าง ${formatCurrency(pending)}${overdue > 0 ? ` | เกินกำหนด ${formatCurrency(overdue)}` : ''}`;
        }

        const summaryBox = document.createElement('div');
        summaryBox.style.display = 'flex';
        summaryBox.style.gap = '8px';
        summaryBox.style.flexWrap = 'wrap';
        const badge = (label, val, color) => `<span style="background:${color}1a;color:${color};padding:4px 10px;border-radius:999px;font-size:12px;">${label}: ${formatCurrency(val)}</span>`;
        summaryBox.innerHTML = `
          ${badge('รวม', total, '#111')}
          ${badge('จ่ายแล้ว', paid, '#16a34a')}
          ${badge('ค้าง', pending, '#f59e0b')}
          ${badge('เกินกำหนด', overdue, '#dc2626')}
        `;

        const table = document.createElement('div');
        table.style.marginTop = '8px';
        table.style.display = 'grid';
        table.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
        table.style.gap = '8px';

        const todoMap = Object.fromEntries(allTodos.map(t => [t.id, t.title]));

        const fmtDate = (d) => {
            if (!d) return '-';
            const date = new Date(d);
            if (isNaN(date)) return '-';
            return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        const badgeStatus = (status) => {
            const color = {
                pending: '#f59e0b',
                ordered: '#3b82f6',
                received: '#0ea5e9',
                paid: '#16a34a',
                void: '#6b7280'
            }[status] || '#6b7280';
            const text = {
                pending: 'รอดำเนินการ',
                ordered: 'สั่งซื้อแล้ว',
                received: 'ได้รับของแล้ว',
                paid: 'จ่ายแล้ว',
                void: 'ยกเลิก'
            }[status] || status;
            return `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:999px;font-size:12px;">${text}</span>`;
        };

        list.forEach(item => {
            const qty = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const totalItem = qty * unitPrice;
            const card = document.createElement('div');
            card.style.border = '1px solid #e5e7eb';
            card.style.borderRadius = '10px';
            card.style.padding = '10px';
            card.style.background = '#fff';
            card.innerHTML = `
              <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">
                <div style="font-weight:700;">${escapeHtml(item.title || '')}</div>
                ${badgeStatus(item.status)}
              </div>
              <div style="color:#6b7280;font-size:12px;margin-top:2px;">งาน: ${escapeHtml(todoMap[item.todo_id] || '-')}</div>
              <div style="margin-top:2px;font-size:12px;">ร้าน: ${escapeHtml(item.vendor || '-')}</div>
              <div style="margin-top:2px;font-size:12px;">จำนวน: ${qty} ${escapeHtml(item.unit || '')} @ ${formatCurrency(unitPrice)} = <b>${formatCurrency(totalItem)}</b></div>
              <div style="margin-top:2px;font-size:12px;">กำหนด: ${fmtDate(item.due_date)}</div>
              ${item.note ? `<div style="margin-top:4px;font-size:12px;color:#4b5563;">${escapeHtml(item.note)}</div>` : ''}
            `;
            table.appendChild(card);
        });

        content.innerHTML = '';
        content.appendChild(summaryBox);
        content.appendChild(table);
    } catch (err) {
        console.error(err);
        content.innerHTML = '<small style="color:#dc2626;">โหลดรายการซื้อไม่สำเร็จ</small>';
    }
}

async function openPurchaseOverviewModal() {
    if (!purchaseOverviewModal || !currentPropertyId) return;
    purchaseOverviewModal.classList.add('open');
    const modalSummary = document.getElementById('purchase-overview-modal-summary');
    const modalList = document.getElementById('purchase-overview-modal-list');
    if (modalSummary) modalSummary.textContent = 'กำลังโหลด...';
    if (modalList) modalList.innerHTML = '';

    try {
        const list = await listPurchasesByProperty(currentPropertyId);
        const sum = (arr, fn) => arr.filter(fn).reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0);
        const total = sum(list, () => true);
        const paid = sum(list, i => i.status === 'paid');
        const now = new Date();
        const overdue = sum(list, i => i.status !== 'paid' && i.due_date && new Date(i.due_date) < now);
        const pending = total - paid;
        if (modalSummary) {
            modalSummary.textContent = `รวม ${formatCurrency(total)} | จ่ายแล้ว ${formatCurrency(paid)} | ค้าง ${formatCurrency(pending)}${overdue > 0 ? ` | เกินกำหนด ${formatCurrency(overdue)}` : ''}`;
        }
        if (!modalList) return;
        if (!list.length) {
            modalList.innerHTML = '<small style="color:#9ca3af;">ยังไม่มีรายการซื้อ</small>';
            return;
        }
        const todoMap = Object.fromEntries(allTodos.map(t => [t.id, t.title]));
        const fmtDate = (d) => {
            if (!d) return '-';
            const date = new Date(d);
            if (isNaN(date)) return '-';
            return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
        };
        const badgeStatus = (status) => {
            const color = {
                pending: '#f59e0b',
                ordered: '#3b82f6',
                received: '#0ea5e9',
                paid: '#16a34a',
                void: '#6b7280'
            }[status] || '#6b7280';
            const text = {
                pending: 'รอดำเนินการ',
                ordered: 'สั่งซื้อแล้ว',
                received: 'ได้รับของแล้ว',
                paid: 'จ่ายแล้ว',
                void: 'ยกเลิก'
            }[status] || status;
            return `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:999px;font-size:11px;">${text}</span>`;
        };
        const rows = list.map((item, idx) => {
            const qty = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const totalItem = qty * unitPrice;
            return `
              <tr>
                <td style="padding:6px;">${idx + 1}</td>
                <td style="padding:6px;">${escapeHtml(item.title || '')}</td>
                <td style="padding:6px;">${escapeHtml(todoMap[item.todo_id] || '-')}</td>
                <td style="padding:6px;">${escapeHtml(item.vendor || '-')}</td>
                <td style="padding:6px;">${qty} ${escapeHtml(item.unit || '')}</td>
                <td style="padding:6px;text-align:right;">${formatCurrency(unitPrice)}</td>
                <td style="padding:6px;text-align:right;">${formatCurrency(totalItem)}</td>
                <td style="padding:6px;">${fmtDate(item.due_date)}</td>
                <td style="padding:6px;">${badgeStatus(item.status)}</td>
                <td style="padding:6px;">${escapeHtml(item.note || '')}</td>
              </tr>
            `;
        }).join('');
        modalList.innerHTML = `
          <div style="overflow:auto; max-height:70vh;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead>
                <tr style="background:#f9fafb; border-bottom:1px solid #e5e7eb;">
                  <th style="padding:6px;text-align:left;">#</th>
                  <th style="padding:6px;text-align:left;">รายการ</th>
                  <th style="padding:6px;text-align:left;">งาน</th>
                  <th style="padding:6px;text-align:left;">ร้าน</th>
                  <th style="padding:6px;text-align:left;">จำนวน</th>
                  <th style="padding:6px;text-align:right;">ราคา/หน่วย</th>
                  <th style="padding:6px;text-align:right;">รวม</th>
                  <th style="padding:6px;text-align:left;">กำหนด</th>
                  <th style="padding:6px;text-align:left;">สถานะ</th>
                  <th style="padding:6px;text-align:left;">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
    } catch (err) {
        console.error(err);
        if (modalSummary) modalSummary.textContent = 'โหลดไม่สำเร็จ';
        if (modalList) modalList.innerHTML = '<small style="color:#dc2626;">โหลดรายการซื้อไม่สำเร็จ</small>';
    }
}

/**
 * พิมพ์/บันทึก PDF สำหรับ modal รายการซื้อ (ใช้ window แยกเพื่อเลี่ยงหน้าว่าง)
 */
async function handlePrintPurchaseOverview() {
    if (!currentPropertyId) {
        toast('กรุณาเลือกบ้านก่อน', 2000, 'warning');
        return;
    }
    const btn = document.getElementById('purchase-overview-print');
    if (btn) btn.disabled = true;
    try {
        const list = await listPurchasesByProperty(currentPropertyId);
        const { total, paid, pending, overdue } = calcPurchaseTotals(list);
        const todoMap = Object.fromEntries(allTodos.map(t => [t.id, t.title]));
        const rows = list.map((item, idx) => {
            const qty = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const totalItem = qty * unitPrice;
            return `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(item.title || '')}</td>
                <td>${escapeHtml(todoMap[item.todo_id] || '-')}</td>
                <td>${escapeHtml(item.vendor || '-')}</td>
                <td>${qty} ${escapeHtml(item.unit || '')}</td>
                <td style="text-align:right;">${formatCurrency(unitPrice)}</td>
                <td style="text-align:right;">${formatCurrency(totalItem)}</td>
                <td>${formatShortDate(item.due_date)}</td>
                <td>${formatStatusText(item.status)}</td>
                <td>${escapeHtml(item.note || '')}</td>
              </tr>
            `;
        }).join('');

        const html = `
          <html lang="th">
            <head>
              <meta charset="UTF-8" />
              <title>รายการซื้อทั้งหมด</title>
              <style>
                @page { margin: 15mm; }
                body { font-family: "Segoe UI", "Noto Sans Thai", sans-serif; color:#111827; margin:0; padding:10mm; box-sizing:border-box; }
                h3 { margin:0 0 12px 0; }
                table { width:100%; border-collapse: collapse; font-size:12px; }
                th, td { padding:8px; border-bottom:1px solid #e5e7eb; text-align:left; vertical-align:top; }
                thead th { background:#f9fafb; }
                .summary { margin-bottom:12px; color:#6b7280; font-size:12px; }
              </style>
            </head>
            <body>
              <h3>รายการซื้อทั้งหมด</h3>
              <div class="summary">รวม ${formatCurrency(total)} | จ่ายแล้ว ${formatCurrency(paid)} | ค้าง ${formatCurrency(pending)}${overdue > 0 ? ` | เกินกำหนด ${formatCurrency(overdue)}` : ''}</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>รายการ</th>
                    <th>งาน</th>
                    <th>ร้าน</th>
                    <th>จำนวน</th>
                    <th style="text-align:right;">ราคา/หน่วย</th>
                    <th style="text-align:right;">รวม</th>
                    <th>กำหนด</th>
                    <th>สถานะ</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="10" style="text-align:center;color:#9ca3af;">ยังไม่มีรายการซื้อ</td></tr>'}
                </tbody>
              </table>
            </body>
          </html>
        `;

        // ใช้ iframe ซ่อนเพื่อความเสถียร (เลี่ยงหน้าว่าง/บล็อก popup)
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.srcdoc = html;
        document.body.appendChild(iframe);

        const triggerPrint = () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.error('iframe print failed', e);
            } finally {
                setTimeout(() => iframe.remove(), 300);
            }
        };

        iframe.addEventListener('load', () => setTimeout(triggerPrint, 100));
        // fallback
        setTimeout(triggerPrint, 800);
    } catch (err) {
        console.error('Print failed', err);
        toast('พิมพ์ไม่สำเร็จ', 2500, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function closePurchaseOverviewModal() {
    if (purchaseOverviewModal) purchaseOverviewModal.classList.remove('open');
}

/**
 * ส่งออก CSV (นำเข้า Opendocument / LibreOffice ได้)
 */
async function handleExportPurchases() {
    if (!currentPropertyId) return;
    const exportBtn = document.getElementById('purchase-overview-export');
    if (exportBtn) exportBtn.disabled = true;

    try {
        const list = await listPurchasesByProperty(currentPropertyId);
        if (!list || !list.length) {
            toast('ไม่มีข้อมูลสำหรับส่งออก', 2500, 'warning');
            return;
        }

        const todoMap = Object.fromEntries(allTodos.map(t => [t.id, t.title]));
        const header = [
            '#', 'รายการ', 'งาน', 'ร้าน', 'จำนวน', 'หน่วย', 'ราคา/หน่วย', 'รวม', 'กำหนด', 'สถานะ', 'หมายเหตุ'
        ];
        const csvRows = [header];

        list.forEach((item, idx) => {
            const qty = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const totalItem = qty * unitPrice;
            const fmtDate = (d) => {
                if (!d) return '';
                const date = new Date(d);
                if (isNaN(date)) return '';
                return date.toISOString().split('T')[0];
            };
            csvRows.push([
                idx + 1,
                item.title || '',
                todoMap[item.todo_id] || '',
                item.vendor || '',
                qty,
                item.unit || '',
                unitPrice,
                totalItem,
                fmtDate(item.due_date),
                item.status || '',
                item.note || ''
            ]);
        });

        const csv = csvRows.map(r => r.map(csvEscape).join(',')).join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchases_${currentPropertyId}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('ส่งออก CSV สำเร็จ', 2000, 'success');
    } catch (err) {
        console.error('Export failed', err);
        toast('ส่งออกไม่สำเร็จ', 3000, 'error');
    } finally {
        if (exportBtn) exportBtn.disabled = false;
    }
}

/**
 * Handle generate default tasks
 */
/**
 * Handle generate default tasks
 */
async function handleGenerateDefaults() {
    if (!currentPropertyId) return;

    const confirm = await showConfirmModal('ต้องการสร้างรายการงานมาตรฐานสำหรับบ้านหลังนี้ใช่หรือไม่?');
    if (!confirm) return;

    const { error } = await generateDefaultTodos(currentPropertyId);

    if (error) {
        console.error('Error generating defaults:', error);
        toast('ไม่สามารถสร้างรายการงานได้', 3000, 'error');
        return;
    }

    toast('สร้างรายการงานมาตรฐานเรียบร้อย', 2000, 'success');
    loadTodosForProperty(); // Reload
}

function setTodoView(view) {
    const next = TODO_VIEWS.includes(view) ? view : 'list';
    currentTodoView = next;
    localStorage.setItem('todoViewMode', next);

    document.querySelectorAll('.todo-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === next);
    });
    document.querySelectorAll('.todo-view-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `todo-view-${next}`);
    });
    renderTodos();
}

async function loadIssuesForProperty() {
    if (!currentPropertyId) return;
    try {
        const { data } = await listIssuesByProperty(currentPropertyId);
        currentIssues = data || [];
        renderIssueList();
    } catch (err) {
        console.error('Load issues failed', err);
        currentIssues = [];
        renderIssueList();
    }
}

function populateIssueTodoSelect() {
    const select = document.getElementById('todo-issue-todo');
    if (!select) return;
    const currentValue = select.value;
    clear(select);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '-- ไม่ระบุ --';
    select.appendChild(empty);

    allTodos.forEach(todo => {
        const option = document.createElement('option');
        option.value = todo.id;
        option.textContent = todo.title || `งาน ${todo.id}`;
        select.appendChild(option);
    });

    if (currentValue) {
        select.value = currentValue;
    }
}

function renderIssueList() {
    const list = document.getElementById('todo-issue-list');
    if (!list) return;
    list.innerHTML = '';

    if (!currentIssues.length) {
        list.innerHTML = '<div style="color:#9ca3af;">ยังไม่มีรายการความเสี่ยง/ปัญหา</div>';
        return;
    }

    currentIssues.forEach(issue => {
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr auto';
        row.style.gap = '0.5rem';
        row.style.padding = '0.4rem 0';
        row.innerHTML = `
      <div>
        <div style="font-weight:600;">${escapeHtml(issue.title || '-')}</div>
        <div style="font-size:12px; color:#6b7280;">
          ${issue.status || 'open'} • ${issue.severity || 'medium'}
          ${issue.todo_id ? ` • งาน: ${escapeHtml(allTodos.find(t => String(t.id) === String(issue.todo_id))?.title || issue.todo_id)}` : ''}
        </div>
        ${issue.detail ? `<div style="font-size:12px; color:#6b7280;">${escapeHtml(issue.detail)}</div>` : ''}
      </div>
      <div style="display:flex; gap:0.4rem; align-items:center;">
        <button class="btn btn-sm btn-secondary" data-issue-action="edit" data-id="${issue.id}" style="padding:4px 8px;">แก้ไข</button>
        <button class="btn btn-sm" data-issue-action="delete" data-id="${issue.id}" style="padding:4px 8px; background:#ef4444; color:#fff;">ลบ</button>
      </div>
    `;
        list.appendChild(row);
    });

    list.querySelectorAll('[data-issue-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const issue = currentIssues.find(i => String(i.id) === btn.dataset.id);
            if (issue) openIssueModal(issue);
        });
    });
    list.querySelectorAll('[data-issue-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => handleIssueDelete(btn.dataset.id));
    });
}

function openIssueModal(issue = null) {
    const modal = document.getElementById('todo-issue-modal');
    const form = document.getElementById('todo-issue-form');
    if (!modal || !form) return;
    form.reset();
    document.getElementById('todo-issue-id').value = issue?.id || '';
    document.getElementById('todo-issue-name').value = issue?.title || '';
    document.getElementById('todo-issue-todo').value = issue?.todo_id || '';
    document.getElementById('todo-issue-severity').value = issue?.severity || 'medium';
    document.getElementById('todo-issue-status').value = issue?.status || 'open';
    document.getElementById('todo-issue-detail').value = issue?.detail || '';
    modal.classList.add('open');
}

function closeIssueModal() {
    const modal = document.getElementById('todo-issue-modal');
    if (modal) modal.classList.remove('open');
}

async function handleIssueSubmit(e) {
    e.preventDefault();
    if (!currentPropertyId) return;
    const payload = {
        id: document.getElementById('todo-issue-id').value || null,
        property_id: currentPropertyId,
        title: document.getElementById('todo-issue-name').value.trim(),
        todo_id: document.getElementById('todo-issue-todo').value || null,
        severity: document.getElementById('todo-issue-severity').value || 'medium',
        status: document.getElementById('todo-issue-status').value || 'open',
        detail: document.getElementById('todo-issue-detail').value.trim() || null
    };
    if (!payload.title) {
        toast('กรุณาระบุหัวข้อ', 2000, 'error');
        return;
    }
    try {
        const { data } = await upsertIssue(payload);
        if (payload.id) {
            const idx = currentIssues.findIndex(i => String(i.id) === String(payload.id));
            if (idx !== -1) currentIssues[idx] = data;
        } else {
            currentIssues.unshift(data);
        }
        renderIssueList();
        closeIssueModal();
        toast('บันทึกรายการแล้ว', 2000, 'success');
    } catch (err) {
        console.error('Save issue failed', err);
        toast('บันทึกไม่สำเร็จ', 3000, 'error');
    }
}

async function handleIssueDelete(id) {
    try {
        await deleteIssue(id);
        currentIssues = currentIssues.filter(issue => String(issue.id) !== String(id));
        renderIssueList();
        toast('ลบรายการแล้ว', 2000, 'success');
    } catch (err) {
        console.error('Delete issue failed', err);
        toast('ลบไม่สำเร็จ', 3000, 'error');
    }
}

function openTodoModal(todo = null) {
    const modal = document.getElementById('todo-modal');
    const form = document.getElementById('todo-form');
    const title = document.getElementById('todo-modal-title');

    if (!modal || !form) return;

    // Reset form
    form.reset();

    if (todo) {
        // Edit mode
        title.textContent = 'แก้ไขงาน';
        document.getElementById('todo-id').value = todo.id;
        document.getElementById('todo-title').value = todo.title;
        document.getElementById('todo-description').value = todo.description || '';
        document.getElementById('todo-category').value = todo.category_id || '';
        document.getElementById('todo-priority').value = todo.priority;
        document.getElementById('todo-contractor').value = todo.contractor_id || '';
        document.getElementById('todo-assignee-name').value = todo.assignee_name || '';
        document.getElementById('todo-budget-estimate').value = todo.budget_estimate ?? '';
        document.getElementById('todo-evidence-links').value = todo.evidence_links || '';
        document.getElementById('todo-before-links').value = todo.before_links || '';
        document.getElementById('todo-after-links').value = todo.after_links || '';

        if (todo.due_date) {
            document.getElementById('todo-due-date').value = todo.due_date;
        }

        if (todo.reminder_date) {
            // Convert to local datetime format
            const dt = new Date(todo.reminder_date);
            const localDt = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            document.getElementById('todo-reminder').value = localDt;
        }
    } else {
        // Add mode
        title.textContent = 'เพิ่มงานใหม่';
        document.getElementById('todo-property-id').value = currentPropertyId;
    }

    modal.classList.add('open');
}

/**
 * Close todo modal
 */
function closeTodoModal() {
    const modal = document.getElementById('todo-modal');
    if (modal) {
        modal.classList.remove('open');
    }
}

/**
 * Handle todo form submit
 */
async function handleTodoSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    const todoData = {
        id: formData.get('id') || null,
        property_id: formData.get('property_id') || currentPropertyId,
        title: formData.get('title'),
        description: formData.get('description') || null,
        category_id: formData.get('category_id') || null,
        priority: formData.get('priority') || 'medium',
        due_date: formData.get('due_date') || null,
        reminder_date: formData.get('reminder_date') || null,
        contractor_id: formData.get('contractor_id') || null,
        assignee_name: formData.get('assignee_name') || null,
        budget_estimate: formData.get('budget_estimate') ? Number(formData.get('budget_estimate')) : null,
        evidence_links: formData.get('evidence_links') || null,
        before_links: formData.get('before_links') || null,
        after_links: formData.get('after_links') || null
    };

    let result;
    if (todoData.id) {
        // Update
        result = await updateTodo(todoData.id, todoData);
    } else {
        // Create
        result = await createTodo(todoData);
    }

    if (result.error) {
        console.error('Error saving todo:', result.error);
        toast('ไม่สามารถบันทึกงานได้', 3000, 'error');
        return;
    }

    // Update local state
    if (todoData.id) {
        const index = allTodos.findIndex(t => t.id === todoData.id);
        if (index !== -1) {
            allTodos[index] = result.data;
        }
    } else {
        allTodos.push(result.data);
    }

    renderTodos();
    updateStats();
    closeTodoModal();

    toast('บันทึกงานเรียบร้อย', 2000, 'success');
}

/**
 * Update statistics
 */
async function updateStats() {
    if (!currentPropertyId) return;

    const { data: stats } = await getTaskStats(currentPropertyId);

    if (!stats) return;

    // Update progress
    const progressPercent = document.getElementById('todo-progress-percent');
    const progressFill = document.getElementById('todo-progress-fill');

    if (progressPercent) progressPercent.textContent = `${stats.completion_rate}%`;
    if (progressFill) progressFill.style.width = `${stats.completion_rate}%`;

    // Update stat badges
    const pendingBadge = document.getElementById('todo-stat-pending');
    const progressBadge = document.getElementById('todo-stat-progress');
    const completedBadge = document.getElementById('todo-stat-completed');

    if (pendingBadge) pendingBadge.textContent = stats.pending;
    if (progressBadge) progressBadge.textContent = stats.in_progress;
    if (completedBadge) completedBadge.textContent = stats.completed;

    // Update category badges
    updateCategoryBadges();
}

/**
 * Update category filter badges
 */
function updateCategoryBadges() {
    // Update "All" badge
    const allBadge = document.getElementById('badge-all');
    if (allBadge) allBadge.textContent = allTodos.length;

    // Update category badges
    allCategories.forEach(cat => {
        const badge = document.getElementById(`badge-${cat.id}`);
        if (badge) {
            const count = allTodos.filter(t => t.category_id === cat.id).length;
            badge.textContent = count;
        }
    });
}

/**
 * Set active category filter
 */
function setActiveCategoryFilter(category) {
    currentCategoryFilter = category;

    // Update button states
    const buttons = document.querySelectorAll('.category-filter-btn');
    buttons.forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Start notification checking
 */
function startNotificationChecking() {
    // Check immediately
    checkNotifications();

    // Then check every 5 minutes
    notificationCheckInterval = scheduleNotificationCheck(checkNotifications, 5);
}

/**
 * Check for pending notifications
 */
async function checkNotifications() {
    await checkPendingReminders(getPendingReminders, markReminderSent);
}

/**
 * Initialize Confirm Modal
 */
function initConfirmModal() {
    confirmModal = document.getElementById('confirm-modal');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const okBtn = document.getElementById('confirm-ok-btn');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeConfirmModal(false);
        });
    }

    if (okBtn) {
        okBtn.addEventListener('click', () => {
            closeConfirmModal(true);
        });
    }

    // Close on click outside
    if (confirmModal) {
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                closeConfirmModal(false);
            }
        });
    }
}

/**
 * Show Confirm Modal
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
function showConfirmModal(message) {
    return new Promise((resolve) => {
        if (!confirmModal) {
            // Fallback if modal not found
            const result = window.confirm(message);
            resolve(result);
            return;
        }

        const msgEl = document.getElementById('confirm-modal-message');
        if (msgEl) msgEl.textContent = message;

        confirmResolve = resolve;
        confirmModal.classList.add('open');
    });
}

/**
 * Close Confirm Modal
 */
function closeConfirmModal(result) {
    if (confirmModal) {
        confirmModal.classList.remove('open');
    }

    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }
}

/**
 * Utility functions
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getPriorityText(priority) {
    const map = {
        low: 'ต่ำ',
        medium: 'ปานกลาง',
        high: 'สูง',
        urgent: 'เร่งด่วน'
    };
    return map[priority] || priority;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    const dueDate = new Date(dateStr);
    const now = new Date();
    return dueDate < now;
}

function formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvEscape(val) {
    const str = `${val ?? ''}`.replace(/\r?\n|\r/g, ' ');
    if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function formatShortDate(d) {
    if (!d) return '-';
    const date = new Date(d);
    if (isNaN(date)) return '-';
    return date.toISOString().split('T')[0];
}

function formatStatusText(status) {
    const map = {
        pending: 'รอดำเนินการ',
        ordered: 'สั่งซื้อแล้ว',
        received: 'ได้รับของแล้ว',
        paid: 'จ่ายแล้ว',
        void: 'ยกเลิก'
    };
    return map[status] || status || '-';
}

function calcPurchaseTotals(list = []) {
    const sum = (arr, fn) => arr.filter(fn).reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0);
    const total = sum(list, () => true);
    const paid = sum(list, i => i.status === 'paid');
    const now = new Date();
    const overdue = sum(list, i => i.status !== 'paid' && i.due_date && new Date(i.due_date) < now);
    const pending = total - paid;
    return { total, paid, pending, overdue };
}

/**
 * Initialize SortableJS for drag and drop
 */
function initSortable() {
    const container = document.getElementById('todo-list-container');
    if (!container) return;

    // Default configuration for consistent behavior
    const sortableConfig = {
        group: 'shared',
        animation: 150,
        handle: '.todo-drag-handle', // Correct handle
        delay: 0,
        touchStartThreshold: 5, // Prevents accidental drags
        ghostClass: 'todo-item-ghost',
        dragClass: 'todo-item-drag',
        onEnd: async function (evt) {
            const itemEl = evt.item;
            const newIndex = evt.newIndex;
            const oldIndex = evt.oldIndex;

            // If index hasn't changed, do nothing
            if (newIndex === oldIndex && evt.to === evt.from) return;

            const targetList = evt.to;

            // Get all items in the new list to determine new order
            const items = targetList.querySelectorAll('.todo-item');
            const updates = Array.from(items).map((el, idx) => {
                const t = allTodos.find(x => x.id === el.dataset.id);
                if (t) {
                    t.sort_order = idx;
                    // If we support category dragging in future, update category_id here based on section
                }
                return t;
            }).filter(Boolean);

            // Persist updates
            try {
                const { error } = await updateTodoOrder(updates);
                if (error) throw error;
            } catch (err) {
                console.error('Error reordering:', err);
                toast('ไม่สามารถบันทึกการจัดลำดับได้', 3000, 'error');
            }
        }
    };

    // Cleanup old instances if they exist
    if (window.todoSortableInstances) {
        window.todoSortableInstances.forEach(instance => instance.destroy());
    }
    window.todoSortableInstances = [];

    const itemContainers = document.querySelectorAll('.todo-items');
    itemContainers.forEach(el => {
        const sortable = new Sortable(el, sortableConfig);
        window.todoSortableInstances.push(sortable);
    });
}

/**
 * Handle manual move (up/down)
 */
async function handleMoveTodo(e, todoId, direction) {
    if (e) e.stopPropagation(); // Prevent triggering other clicks

    // Find the todo and its list
    const todo = allTodos.find(t => t.id === todoId);
    if (!todo) return;

    // Filter siblings in the same category (or all if no current category filter)
    const categoryId = todo.category_id;

    // Get all todos in this category, sorted by current sort_order
    let siblings = allTodos
        .filter(t => (t.category_id || 'uncategorized') === (categoryId || 'uncategorized'))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const currentIndex = siblings.findIndex(t => t.id === todoId);
    if (currentIndex === -1) return;

    // Calculate swap
    if (direction === 'up') {
        if (currentIndex === 0) return; // Already at top
        // Swap with previous
        const prev = siblings[currentIndex - 1]; // Obj ref
        const curr = siblings[currentIndex]; // Obj ref

        // Swap Sort Orders on the objects
        const tempOrder = curr.sort_order;
        curr.sort_order = prev.sort_order;
        prev.sort_order = tempOrder;

    } else {
        if (currentIndex === siblings.length - 1) return; // Already at bottom
        // Swap with next
        const next = siblings[currentIndex + 1];
        const curr = siblings[currentIndex];

        // Swap Sort Orders on the objects
        const tempOrder = curr.sort_order;
        curr.sort_order = next.sort_order;
        next.sort_order = tempOrder;
    }

    // 1. Sort global array to reflect new order for rendering
    allTodos.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // 2. Optimistic Update
    renderTodos();

    // 3. Prepare updates for DB
    // Re-verify siblings order based on the new sort_order values
    siblings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const updates = siblings.map((t, index) => {
        t.sort_order = index; // Enforce clean 0..N
        return t;
    });

    // Persist
    try {
        const { error } = await updateTodoOrder(updates);
        if (error) throw error;
    } catch (err) {
        console.error('Error saving order:', err);
        toast('บันทึกตำแหน่งไม่สำเร็จ', 3000, 'error');
    }
}
