/**
 * Renovation To-Do Service
 * Handles CRUD operations for renovation tasks and categories
 */

import { supabase } from '../utils/supabaseClient.js';

/**
 * List all categories, sorted by sort_order
 */
export async function listCategories() {
    const { data, error } = await supabase
        .from('renovation_todo_categories')
        .select('*')
        .order('sort_order', { ascending: true });

    return { data, error };
}

/**
 * Create a new custom category
 */
export async function createCategory(categoryData) {
    const { data, error } = await supabase
        .from('renovation_todo_categories')
        .insert([{
            name: categoryData.name,
            icon: categoryData.icon || '📌',
            color: categoryData.color || '#c1a15a',
            sort_order: categoryData.sort_order || 999,
            is_system: false
        }])
        .select()
        .single();

    return { data, error };
}

/**
 * List all todos for a specific property
 */
export async function listTodosByProperty(propertyId) {
    const { data, error } = await supabase
        .from('renovation_todos')
        .select(`
      *,
      category:renovation_todo_categories(id, name, icon, color)
    `)
        .eq('property_id', propertyId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

    return { data, error };
}

/**
 * List todos filtered by category
 */
export async function listTodosByCategory(propertyId, categoryId) {
    const { data, error } = await supabase
        .from('renovation_todos')
        .select(`
      *,
      category:renovation_todo_categories(id, name, icon, color)
    `)
        .eq('property_id', propertyId)
        .eq('category_id', categoryId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

    return { data, error };
}

/**
 * Create a new todo
 */
export async function createTodo(todoData) {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('renovation_todos')
        .insert([{
            property_id: todoData.property_id,
            category_id: todoData.category_id,
            title: todoData.title,
            description: todoData.description || null,
            status: todoData.status || 'pending',
            priority: todoData.priority || 'medium',
            due_date: todoData.due_date || null,
            reminder_date: todoData.reminder_date || null,
            sort_order: todoData.sort_order || 0,
            created_by: user?.id || null
        }])
        .select(`
      *,
      category:renovation_todo_categories(id, name, icon, color)
    `)
        .single();

    return { data, error };
}

/**
 * Update an existing todo
 */
export async function updateTodo(id, updates) {
    const { data, error } = await supabase
        .from('renovation_todos')
        .update(updates)
        .eq('id', id)
        .select(`
      *,
      category:renovation_todo_categories(id, name, icon, color)
    `)
        .single();

    return { data, error };
}

/**
 * Toggle todo status (quick action)
 */
export async function toggleTodoStatus(id, newStatus) {
    return updateTodo(id, { status: newStatus });
}

/**
 * Mark todo as completed
 */
export async function completeTodo(id) {
    return updateTodo(id, { status: 'completed' });
}

/**
 * Delete a todo
 */
export async function deleteTodo(id) {
    const { data, error } = await supabase
        .from('renovation_todos')
        .delete()
        .eq('id', id);

    return { data, error };
}

/**
 * Get todos with pending reminders
 */
export async function getPendingReminders() {
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('renovation_todos')
        .select(`
      *,
      category:renovation_todo_categories(id, name, icon, color),
      property:properties(id, title)
    `)
        .eq('reminder_sent', false)
        .not('reminder_date', 'is', null)
        .lte('reminder_date', now)
        .in('status', ['pending', 'in_progress']);

    return { data, error };
}

/**
 * Mark reminder as sent
 */
export async function markReminderSent(id) {
    return updateTodo(id, { reminder_sent: true });
}

/**
 * Get task statistics for a property
 */
export async function getTaskStats(propertyId) {
    const { data, error } = await supabase
        .from('renovation_todos')
        .select('status')
        .eq('property_id', propertyId);

    if (error) return { data: null, error };

    const stats = {
        total: data.length,
        pending: data.filter(t => t.status === 'pending').length,
        in_progress: data.filter(t => t.status === 'in_progress').length,
        completed: data.filter(t => t.status === 'completed').length,
        cancelled: data.filter(t => t.status === 'cancelled').length,
        completion_rate: 0
    };

    if (stats.total > 0) {
        stats.completion_rate = Math.round((stats.completed / stats.total) * 100);
    }

    return { data: stats, error: null };
}
/**
 * Update todo sort order (batch update)
 */
export async function updateTodoOrder(todos) {
    // Supabase doesn't support batch update natively in JS client easily for different values
    // But we can use upsert if we have IDs.

    const updates = todos.map((todo, index) => ({
        id: todo.id,
        property_id: todo.property_id, // Required for RLS / constraint usually
        category_id: todo.category_id,
        title: todo.title, // REQUIRED for Upsert (even on update, if constraints are checked)
        status: todo.status,
        priority: todo.priority,
        sort_order: index
    }));

    const { data, error } = await supabase
        .from('renovation_todos')
        .upsert(updates, { onConflict: 'id' })
        .select('id, sort_order');

    return { data, error };
}

/**
 * Fetch all standard templates
 */
export async function getTemplates() {
    const { data, error } = await supabase
        .from('renovation_todo_templates')
        .select('*')
        .order('sort_order', { ascending: true });

    if (error) {
        // Table might not exist yet, return null to signal fallback
        console.warn('Templates table not found or error:', error);
        return { data: null, error };
    }
    return { data, error: null };
}

/**
 * Add a task to standard template
 */
export async function addToTemplate(categoryId, title) {
    // Get max sort order
    const { data: maxData } = await supabase
        .from('renovation_todo_templates')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

    const nextSort = (maxData?.sort_order || 0) + 1;

    const { data, error } = await supabase
        .from('renovation_todo_templates')
        .insert([{
            category_id: categoryId,
            title: title,
            sort_order: nextSort
        }])
        .select();

    return { data, error };
}

/**
 * Remove a task from standard templates (by title match)
 */
export async function removeFromTemplate(title) {
    const { data, error } = await supabase
        .from('renovation_todo_templates')
        .delete()
        .eq('title', title); // Delete by title to be safe loosely

    return { data, error };
}

/**
 * Generate default standard tasks for a property (Database Backed)
 */
export async function generateDefaultTodos(propertyId) {
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Ensure Standard Categories Exist
    const standardCats = [
        { name: 'Admin & เอกสาร', keys: ['admin', 'เอกสาร'], icon: '📁', color: '#6b7280', sort: 10 },
        { name: 'รื้อถอน & เตรียมงาน', keys: ['structure', 'รื้อถอน', 'demo'], icon: '🔨', color: '#ef4444', sort: 20 },
        { name: 'โครงสร้าง & หลังคา', keys: ['roof', 'หลังคา', 'struct'], icon: '🏠', color: '#f59e0b', sort: 30 },
        { name: 'งานระบบประปา', keys: ['plumbing', 'ประปา', 'water'], icon: '💧', color: '#3b82f6', sort: 40 },
        { name: 'งานระบบไฟฟ้า', keys: ['electric', 'ไฟฟ้า', 'elec'], icon: '⚡', color: '#eab308', sort: 50 },
        { name: 'ฝ้า & ผนัง', keys: ['ceiling', 'ฝ้า', 'wall'], icon: '🧱', color: '#8b5cf6', sort: 60 },
        { name: 'งานพื้น', keys: ['floor', 'พื้น', 'tile'], icon: '🔲', color: '#10b981', sort: 70 },
        { name: 'งานสี', keys: ['paint', 'สี'], icon: '🎨', color: '#ec4899', sort: 80 },
        { name: 'ครัว & สุขภัณฑ์', keys: ['kitchen', 'ครัว', 'bath'], icon: '🚽', color: '#06b6d4', sort: 90 },
        { name: 'เก็บงาน & ภายนอก', keys: ['external', 'เก็บงาน', 'exterior'], icon: '🌳', color: '#14b8a6', sort: 100 }
    ];

    // Fetch existing categories
    const { data: existingCats } = await listCategories();
    const catMap = {}; // key -> id

    // Map existing categories
    if (existingCats) {
        existingCats.forEach(c => {
            const nameLower = c.name.toLowerCase();
            catMap[nameLower] = c.id;
            standardCats.forEach(sc => {
                if (sc.keys.some(k => nameLower.includes(k))) {
                    catMap[sc.keys[0]] = c.id;
                }
            });
        });
    }

    // Create missing categories
    for (const sc of standardCats) {
        let foundId = catMap[sc.keys[0]] || catMap[sc.name.toLowerCase()];

        if (!foundId) {
            // Not in map, try to create
            const { data: newCat, error: createError } = await createCategory({
                name: sc.name, icon: sc.icon, color: sc.color, sort_order: sc.sort
            });

            if (newCat) {
                foundId = newCat.id;
            } else if (createError && createError.code === '23505') {
                // Conflict (Duplicate Name) - Try to fetch it by name to resolve ID
                const { data: existing } = await supabase
                    .from('renovation_todo_categories')
                    .select('id')
                    .ilike('name', sc.name)
                    .single();
                if (existing) foundId = existing.id;
            }
        }

        // Update map if we resolved an ID
        if (foundId) {
            sc.keys.forEach(k => catMap[k] = foundId);
            catMap[sc.name.toLowerCase()] = foundId;
        }
    }

    // 2. Fetch Templates (Try DB first)
    let templateList = [];
    const { data: dbTemplates, error: dbError } = await getTemplates();

    if (dbTemplates && dbTemplates.length > 0) {
        // USE DB TEMPLATES
        templateList = dbTemplates.map(t => ({
            catId: t.category_id,
            title: t.title,
            sort: t.sort_order
        }));
    } else {
        // FALLBACK / SEED : Use Hardcoded Standard List
        const hardcoded = [
            // Admin / Prep
            { cat: 'admin', title: 'สำรวจหน้างานและวัดพื้นที่ละเอียด (As-built Check)', sort: 1 },
            { cat: 'admin', title: 'ตรวจสอบโฉนดและแนวเขตที่ดิน', sort: 2 },
            { cat: 'admin', title: 'ออกแบบวางผังการใช้สอย (Layout Plan)', sort: 3 },
            { cat: 'admin', title: 'ทำรายการวัสดุและประเมินราคา (BOQ)', sort: 4 },
            { cat: 'admin', title: 'ขออนุญาตปรับปรุงอาคาร (เขต/เทศบาล) *ถ้ามีโครงสร้าง', sort: 5 },
            { cat: 'admin', title: 'ขอน้ำประปา-ไฟฟ้าชั่วคราว (ถ้าจำเป็น)', sort: 6 },
            { cat: 'admin', title: 'แจ้งนิติบุคคล/เพื่อนบ้าน ก่อนเข้างาน', sort: 7 },

            // Demo & Clean
            { cat: 'structure', title: 'เคลียร์ขยะและวัชพืชรอบบริเวณบ้าน', sort: 10 },
            { cat: 'structure', title: 'รื้อถอนเฟอร์นิเจอร์ Built-in เก่าที่เสียหาย', sort: 11 },
            { cat: 'structure', title: 'รื้อถอนสุขภัณฑ์และอุปกรณ์ห้องน้ำเก่า', sort: 12 },
            { cat: 'structure', title: 'รื้อฝ้าเพดานเก่า (ถ้าปลวกกินหรือทรุดโทรม)', sort: 13 },
            { cat: 'structure', title: 'สกัดผิวผนัง/พื้น ส่วนที่ร่อนหรือต้องการปูใหม่', sort: 14 },
            { cat: 'structure', title: 'ขนย้ายเศษวัสดุก่อสร้างไปทิ้ง', sort: 15 },

            // Structure & Roof
            { cat: 'roof', title: 'ตรวจสอบรอยร้าวเสา-คาน และซ่อมแซม (Injection)', sort: 20 },
            { cat: 'roof', title: 'ตรวจสอบจุดรั่วซึมบนหลังคา', sort: 21 },
            { cat: 'roof', title: 'เปลี่ยนกระเบื้องหลังคาที่แตก/ชำรุด', sort: 22 },
            { cat: 'roof', title: 'ทากันซึมดาดฟ้า/รอยต่อหลังคา (Waterproof)', sort: 23 },
            { cat: 'roof', title: 'ติดตั้งฉนวนกันความร้อนใต้หลังคา', sort: 24 },
            { cat: 'roof', title: 'ติดตั้งไม้เชิงชาย/รางน้ำฝนใหม่', sort: 25 },
            { cat: 'roof', title: 'เทพื้นปรับระดับ (Screed) ภายในบ้าน', sort: 26 },

            // Plumbing
            { cat: 'plumbing', title: 'วางระบบท่อน้ำดีใหม่ (PPR/PVC)', sort: 30 },
            { cat: 'plumbing', title: 'วางระบบท่อน้ำทิ้ง/ท่อส้วมใหม่', sort: 31 },
            { cat: 'plumbing', title: 'ติดตั้งถังบำบัดน้ำเสีย (SAT) ใหม่', sort: 32 },
            { cat: 'plumbing', title: 'ติดตั้งถังเก็บน้ำและปั๊มน้ำ', sort: 33 },
            { cat: 'plumbing', title: 'เดินท่อระบายน้ำทิ้งรอบตัวบ้าน', sort: 34 },
            { cat: 'plumbing', title: 'ทดสอบแรงดันน้ำ (Test Pressure)', sort: 35 },

            // Electrical
            { cat: 'electric', title: 'เดินสายไฟเมนเข้าบ้านใหม่', sort: 40 },
            { cat: 'electric', title: 'ติดตั้งตู้ Consumer Unit และเดินสายดิน (Ground)', sort: 41 },
            { cat: 'electric', title: 'ร้อยสายไฟแสงสว่าง/ปลั๊ก (ร้อยท่อ/กริ๊ป)', sort: 42 },
            { cat: 'electric', title: 'ติดตั้งเต้ารับ/สวิตช์ไฟตามจุดต่างๆ', sort: 43 },
            { cat: 'electric', title: 'ติดตั้งดวงโคม (Downlight/โคมซาลาเปา)', sort: 44 },
            { cat: 'electric', title: 'เดินสายไฟแอร์/เครื่องทำน้ำอุ่น', sort: 45 },

            // Ceiling
            { cat: 'ceiling', title: 'ขึ้นโครงเคร่าฝ้าเพดานใหม่', sort: 50 },
            { cat: 'ceiling', title: 'ติดตั้งแผ่นยิปซั่มฉาบเรียบ/ทีบาร์', sort: 51 },
            { cat: 'ceiling', title: 'ซ่อมแซมรอยร้าวผนัง (Skim Coat)', sort: 52 },
            { cat: 'ceiling', title: 'ติดตั้งบัวพื้น/มอบฝ้า', sort: 53 },

            // Floor
            { cat: 'floor', title: 'ปูกระเบื้องพื้นชั้น 1 (แกรนิตโต้/SPC)', sort: 60 },
            { cat: 'floor', title: 'ขัดพื้นไม้ปาร์เก้/ติดตั้งพื้น SPC ชั้น 2', sort: 61 },
            { cat: 'floor', title: 'ปูกระเบื้องห้องน้ำ (พื้น/ผนัง)', sort: 62 },
            { cat: 'floor', title: 'ยาแนวกระเบื้องเก็บงาน', sort: 63 },

            // Paint
            { cat: 'paint', title: 'ขัดลอกสีเก่าเดิมออก', sort: 70 },
            { cat: 'paint', title: 'ทาสีรองพื้นปูนเก่า', sort: 71 },
            { cat: 'paint', title: 'ทาสีจริงภายนอก (2 เที่ยว)', sort: 72 },
            { cat: 'paint', title: 'ทาสีจริงภายใน (2 เที่ยว)', sort: 73 },

            // Kitchen & Bath
            { cat: 'kitchen', title: 'ก่อเคาน์เตอร์ครัวปูน', sort: 80 },
            { cat: 'kitchen', title: 'ติดตั้งบานซิงค์/ตู้แขวน', sort: 81 },
            { cat: 'kitchen', title: 'ติดตั้งอ่างล้างจาน/ก๊อกน้ำครัว', sort: 82 },
            { cat: 'kitchen', title: 'ติดตั้งชักโครก/อ่างล้างหน้า', sort: 83 },
            { cat: 'kitchen', title: 'ติดตั้งฝักบัว/สายชำระ/กระจก', sort: 84 },

            // External
            { cat: 'external', title: 'ซ่อมแซม/ทาสีรั้วบ้าน', sort: 90 },
            { cat: 'external', title: 'ปรับปรุงประตูรั้วเหล็ก/สแตนเลส', sort: 91 },
            { cat: 'external', title: 'ทำความสะอาดใหญ่ (Deep Cleaning)', sort: 95 },
            { cat: 'external', title: 'ถ่ายรูป/วีดีโอ หลังรีโนเวทเสร็จ', sort: 96 },
            { cat: 'admin', title: 'ติดป้ายประกาศขาย', sort: 97 },
        ];

        // Prepare list with resolved IDs
        templateList = hardcoded.map(t => ({
            catId: catMap[t.cat] || catMap['admin'] || Object.values(catMap)[0],
            title: t.title,
            sort: t.sort
        }));

        // OPTIONAL: Seed DB (Auto-Migration)
        // Only if table exists (check previous error)
        if (!dbError) {
            console.log("Seeding templates table...");
            const seeds = templateList.map(t => ({
                category_id: t.catId,
                title: t.title,
                sort_order: t.sort
            }));
            await supabase.from('renovation_todo_templates').insert(seeds);
        }
    }

    // 3. Prepare Batch Insert for Property
    const toInsert = templateList.map(t => ({
        property_id: propertyId,
        category_id: t.catId, // Already resolved
        title: t.title,
        status: 'pending',
        priority: 'medium',
        sort_order: t.sort,
        created_by: user?.id
    }));

    const { data, error } = await supabase
        .from('renovation_todos')
        .insert(toInsert)
        .select();

    return { data, error };
}

