-- =====================================================
-- Renovation To-Do List System - Database Schema
-- =====================================================
-- This migration creates tables for managing renovation tasks
-- organized by categories (systems) with reminders and notifications

-- =====================================================
-- 1. Create Categories Table
-- =====================================================
CREATE TABLE IF NOT EXISTS renovation_todo_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📌',
  color TEXT DEFAULT '#c1a15a',
  sort_order INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add unique constraint on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_todo_categories_name ON renovation_todo_categories(LOWER(name));

-- =====================================================
-- 2. Create To-Do Items Table
-- =====================================================
CREATE TABLE IF NOT EXISTS renovation_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category_id UUID REFERENCES renovation_todo_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  reminder_date TIMESTAMP WITH TIME ZONE,
  reminder_sent BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_todos_property ON renovation_todos(property_id);
CREATE INDEX IF NOT EXISTS idx_todos_category ON renovation_todos(category_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON renovation_todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON renovation_todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_reminder ON renovation_todos(reminder_date) WHERE reminder_sent = false;

-- =====================================================
-- 3. Enable Row Level Security (RLS)
-- =====================================================
ALTER TABLE renovation_todo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovation_todos ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. RLS Policies for Categories
-- =====================================================

-- Allow all authenticated users to read categories
CREATE POLICY "Anyone can view categories"
  ON renovation_todo_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create custom categories
CREATE POLICY "Authenticated users can create categories"
  ON renovation_todo_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow users to update non-system categories
CREATE POLICY "Users can update custom categories"
  ON renovation_todo_categories
  FOR UPDATE
  TO authenticated
  USING (is_system = false)
  WITH CHECK (is_system = false);

-- Allow users to delete non-system categories
CREATE POLICY "Users can delete custom categories"
  ON renovation_todo_categories
  FOR DELETE
  TO authenticated
  USING (is_system = false);

-- =====================================================
-- 5. RLS Policies for To-Do Items
-- =====================================================

-- Allow authenticated users to view all todos
-- (In a multi-tenant system, you might want to restrict this further)
CREATE POLICY "Authenticated users can view todos"
  ON renovation_todos
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create todos
CREATE POLICY "Authenticated users can create todos"
  ON renovation_todos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update todos
CREATE POLICY "Authenticated users can update todos"
  ON renovation_todos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete todos
CREATE POLICY "Authenticated users can delete todos"
  ON renovation_todos
  FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- 6. Triggers for updated_at
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for categories
DROP TRIGGER IF EXISTS update_todo_categories_updated_at ON renovation_todo_categories;
CREATE TRIGGER update_todo_categories_updated_at
  BEFORE UPDATE ON renovation_todo_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for todos
DROP TRIGGER IF EXISTS update_todos_updated_at ON renovation_todos;
CREATE TRIGGER update_todos_updated_at
  BEFORE UPDATE ON renovation_todos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. Trigger to set completed_at when status changes
-- =====================================================

CREATE OR REPLACE FUNCTION set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_todo_completed_at ON renovation_todos;
CREATE TRIGGER set_todo_completed_at
  BEFORE UPDATE ON renovation_todos
  FOR EACH ROW
  EXECUTE FUNCTION set_completed_at();

-- =====================================================
-- 8. Comments for documentation
-- =====================================================

COMMENT ON TABLE renovation_todo_categories IS 'Categories/systems for organizing renovation tasks';
COMMENT ON TABLE renovation_todos IS 'Individual renovation tasks with reminders and status tracking';

COMMENT ON COLUMN renovation_todo_categories.is_system IS 'System-defined categories cannot be deleted';
COMMENT ON COLUMN renovation_todos.status IS 'Task status: pending, in_progress, completed, cancelled';
COMMENT ON COLUMN renovation_todos.priority IS 'Task priority: low, medium, high, urgent';
COMMENT ON COLUMN renovation_todos.reminder_date IS 'When to send notification reminder';
COMMENT ON COLUMN renovation_todos.reminder_sent IS 'Whether reminder notification has been sent';
