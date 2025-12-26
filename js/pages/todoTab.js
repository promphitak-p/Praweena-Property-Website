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


import { toast } from '../ui/toast.js';
import { clear } from '../ui/dom.js';

// State
let currentPropertyId = null;
let currentCategoryFilter = 'all';
let allCategories = [];
let allTodos = [];
let notificationCheckInterval = null;

/**
 * Initialize the to-do tab
 */
export async function initTodoTab() {
    // Load categories
    await loadCategories();

    // Setup notification banner
    setupNotificationBanner();

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
            btn.innerHTML = `${cat.icon} ${cat.name} <span class="badge" id="badge-${cat.id}">0</span>`;
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
}

/**
 * Render todos based on current filter
 */
function renderTodos() {
    const container = document.getElementById('todo-list-container');
    const emptyState = document.getElementById('todo-empty-state');

    if (!container) return;

    clear(container);

    // Filter todos
    let filteredTodos = allTodos;
    if (currentCategoryFilter !== 'all') {
        filteredTodos = allTodos.filter(t => t.category_id === currentCategoryFilter);
    }

    // Show empty state if no todos
    if (filteredTodos.length === 0) {
        container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    container.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    // Group by category
    const grouped = {};
    filteredTodos.forEach(todo => {
        const catId = todo.category_id || 'uncategorized';
        if (!grouped[catId]) grouped[catId] = [];
        grouped[catId].push(todo);
    });

    // Render each category section
    Object.keys(grouped).forEach(catId => {
        const todos = grouped[catId];
        const category = allCategories.find(c => c.id === catId);

        const section = createCategorySection(category, todos);
        container.appendChild(section);
    });

    // Initialize SortableJS for drag and drop
    initSortable();
}

/**
 * Create a category section with todos
 */
function createCategorySection(category, todos) {
    const section = document.createElement('div');
    section.className = 'todo-category-section';

    const header = document.createElement('div');
    header.className = 'todo-category-header';
    header.innerHTML = `
    <span class="todo-category-icon">${category?.icon || '📌'}</span>
    <h4 class="todo-category-title">${category?.name || 'ไม่มีหมวดหมู่'}</h4>
    <span class="todo-category-count">${todos.length}</span>
  `;

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
    const item = document.createElement('div');
    item.className = `todo-item ${todo.status === 'completed' ? 'completed' : ''}`;
    item.dataset.id = todo.id;

    const isCompleted = todo.status === 'completed';

    item.innerHTML = `
     <div class="todo-checkbox ${isCompleted ? 'checked' : ''}" data-id="${todo.id}"></div>
    <div class="todo-content">
      <div class="todo-title">${escapeHtml(todo.title)}</div>
      ${todo.description ? `<div class="todo-description">${escapeHtml(todo.description)}</div>` : ''}
      <div class="todo-meta">
        <span class="todo-priority ${todo.priority}">${getPriorityText(todo.priority)}</span>
        ${todo.due_date ? `<span class="todo-due-date ${isOverdue(todo.due_date) ? 'overdue' : ''}">📅 ${formatDate(todo.due_date)}</span>` : ''}
        ${todo.reminder_date ? `<span class="todo-reminder">🔔 ${formatDateTime(todo.reminder_date)}</span>` : ''}
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
    checkbox.addEventListener('click', () => handleToggleStatus(todo.id, todo.status));

    const editBtn = item.querySelector('.edit');
    editBtn.addEventListener('click', () => openTodoModal(todo));

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
 * Handle delete todo
 */
async function handleDeleteTodo(todoId) {
    if (!confirm('คุณต้องการลบงานนี้ใช่หรือไม่?')) return;

    const { error } = await deleteTodo(todoId);

    if (error) {
        console.error('Error deleting todo:', error);
        toast('ไม่สามารถลบงานได้', 3000, 'error');
        return;
    }

    // Remove from local state
    allTodos = allTodos.filter(t => t.id !== todoId);

    renderTodos();
    updateStats();
    toast('ลบงานเรียบร้อย', 2000, 'success');
}

/**
 * Handle generate default tasks
 */
async function handleGenerateDefaults() {
    if (!currentPropertyId) return;

    if (!confirm('ต้องการสร้างรายการงานมาตรฐานสำหรับบ้านหลังนี้ใช่หรือไม่?')) return;

    const { error } = await generateDefaultTodos(currentPropertyId);

    if (error) {
        console.error('Error generating defaults:', error);
        toast('ไม่สามารถสร้างรายการงานได้', 3000, 'error');
        return;
    }

    toast('สร้างรายการงานมาตรฐานเรียบร้อย', 2000, 'success');
    loadTodosForProperty(); // Reload
}

/**
 * Open todo modal for add/edit
 */
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
        reminder_date: formData.get('reminder_date') || null
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
