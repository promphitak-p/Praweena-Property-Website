// ==================== TO-DO TAB PROPERTY SELECTOR ====================

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
