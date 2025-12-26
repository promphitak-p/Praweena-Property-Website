/**
 * Dashboard To-Do Tab Integration
 * 
 * Add this code to dashboard.page.js to integrate the to-do list functionality
 */

// 1. Add this import at the top of dashboard.page.js (after other imports):
import { initTodoTab, setTodoProperty } from './todoTab.js';

// 2. Add this variable declaration with other state variables:
let todoTabInitialized = false;

// 3. Add this to the tab switching logic (where tabs are handled):
// Find the section that handles tab clicks and add 'todos' case:

/*
Example tab switching code to add:

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    // Remove active from all tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Add active to clicked tab
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    
    // Initialize to-do tab on first view
    if (tab === 'todos' && !todoTabInitialized) {
      initTodoTab();
      todoTabInitialized = true;
      setupTodoPropertySelector();
    }
  });
});
*/

// 4. Add this function to setup the property selector for to-do tab:

function setupTodoPropertySelector() {
    const searchInput = document.getElementById('todo-property-search');
    const dropdown = document.getElementById('todo-property-dropdown');

    if (!searchInput || !dropdown) return;

    // Show dropdown on focus
    searchInput.addEventListener('focus', () => {
        dropdown.style.display = 'block';
        populateTodoPropertyDropdown();
    });

    // Hide dropdown on blur (with delay for click)
    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 200);
    });

    // Filter on input
    searchInput.addEventListener('input', () => {
        populateTodoPropertyDropdown(searchInput.value);
    });
}

function populateTodoPropertyDropdown(filter = '') {
    const dropdown = document.getElementById('todo-property-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    // Filter properties
    const filtered = propertiesData.filter(p => {
        if (!filter) return true;
        const title = (p.title || '').toLowerCase();
        return title.includes(filter.toLowerCase());
    });

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding:1rem;color:#9ca3af;">ไม่พบบ้านที่ค้นหา</div>';
        return;
    }

    filtered.forEach(property => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:0.75rem 1rem;cursor:pointer;border-bottom:1px solid #f3f4f6;transition:background 0.2s;';
        item.innerHTML = `
      <div style="font-weight:600;color:#111827;">${property.title || 'ไม่มีชื่อ'}</div>
      <div style="font-size:0.85rem;color:#6b7280;">${property.district || ''} ${property.province || ''}</div>
    `;

        item.addEventListener('mouseenter', () => {
            item.style.background = '#f9fafb';
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });

        item.addEventListener('click', () => {
            selectTodoProperty(property);
        });

        dropdown.appendChild(item);
    });
}

function selectTodoProperty(property) {
    const searchInput = document.getElementById('todo-property-search');
    const dropdown = document.getElementById('todo-property-dropdown');

    if (searchInput) {
        searchInput.value = property.title || 'ไม่มีชื่อ';
    }

    if (dropdown) {
        dropdown.style.display = 'none';
    }

    // Set property in to-do tab
    setTodoProperty(property.id, property.title);
}

// 5. IMPORTANT: Make sure propertiesData is accessible
// The propertiesData variable should be populated when properties are loaded
// This is already done in the existing dashboard code

/**
 * INSTALLATION INSTRUCTIONS:
 * 
 * 1. Copy the import statement to the top of dashboard.page.js
 * 2. Add the todoTabInitialized variable with other state variables
 * 3. Find the tab switching event listeners and add the 'todos' case
 * 4. Add the setupTodoPropertySelector and related functions
 * 5. Test by opening the dashboard and clicking on the "รายการงาน" tab
 */
