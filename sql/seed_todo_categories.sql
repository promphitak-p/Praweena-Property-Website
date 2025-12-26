-- =====================================================
-- Seed Data: Pre-defined Renovation Task Categories
-- =====================================================
-- This script populates the renovation_todo_categories table
-- with common renovation systems/categories

-- Clear existing system categories (optional, for re-seeding)
-- DELETE FROM renovation_todo_categories WHERE is_system = true;

-- Insert pre-defined categories
INSERT INTO renovation_todo_categories (name, icon, color, sort_order, is_system)
VALUES
  ('โครงสร้างและพื้นฐาน', '🏗️', '#8b4513', 1, true),
  ('ระบบไฟฟ้า', '⚡', '#fbbf24', 2, true),
  ('ระบบน้ำและสุขาภิบาล', '💧', '#3b82f6', 3, true),
  ('งานพื้นและกระเบื้อง', '🔲', '#6b7280', 4, true),
  ('งานทาสีและตกแต่ง', '🎨', '#ec4899', 5, true),
  ('งานครัวและห้องน้ำ', '🚿', '#06b6d4', 6, true),
  ('งานประตูหน้าต่าง', '🚪', '#92400e', 7, true),
  ('งานเฟอร์นิเจอร์', '🪑', '#a16207', 8, true),
  ('งานภูมิทัศน์', '🌳', '#16a34a', 9, true),
  ('เอกสารและใบอนุญาต', '📋', '#7c3aed', 10, true),
  ('อื่นๆ', '📌', '#c1a15a', 99, true)
ON CONFLICT (LOWER(name)) DO NOTHING;

-- Verify insertion
SELECT 
  name,
  icon,
  color,
  sort_order,
  is_system
FROM renovation_todo_categories
ORDER BY sort_order;
