-- =====================================================
-- Renovation To-Do Templates Table
-- =====================================================

CREATE TABLE IF NOT EXISTS renovation_todo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES renovation_todo_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE renovation_todo_templates ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view templates"
  ON renovation_todo_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage templates"
  ON renovation_todo_templates FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_templates_category ON renovation_todo_templates(category_id);
