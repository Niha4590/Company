-- ============================================================
-- Migration: 002_hr_enhancements.sql
-- Extra HR tables, RPC, indexes, and reference data
-- Run after 001_initial_schema.sql
-- ============================================================

-- Bonuses (one-off, not part of recurring structure)
CREATE TABLE IF NOT EXISTS salary_bonuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  bonus_type VARCHAR(50) NOT NULL DEFAULT 'performance',
  effective_date DATE NOT NULL,
  reason TEXT,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_bonuses_emp ON salary_bonuses(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_increments_emp ON salary_increments(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_structures_emp_current ON salary_structures(employee_id, is_current);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_status ON attendance_corrections(status);
CREATE INDEX IF NOT EXISTS idx_resignations_emp ON resignations(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

CREATE TABLE IF NOT EXISTS experience_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  resignation_id UUID REFERENCES resignations(id) ON DELETE SET NULL,
  letter_number VARCHAR(50) UNIQUE NOT NULL,
  issued_on DATE NOT NULL DEFAULT CURRENT_DATE,
  issued_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic leave-balance deduction used by leave review
CREATE OR REPLACE FUNCTION increment_leave_used(
  p_employee_id UUID,
  p_leave_type_id UUID,
  p_year INTEGER,
  p_days NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE leave_balances
  SET used_days = used_days + p_days,
      updated_at = NOW()
  WHERE employee_id = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND year = p_year;
END;
$$ LANGUAGE plpgsql;

-- Seed leave types
INSERT INTO leave_types (name, max_days_per_year, is_carry_forward, max_carry_forward_days, is_paid, requires_documentation)
VALUES
  ('Casual Leave', 12, false, 0, true, false),
  ('Sick Leave', 10, false, 0, true, true),
  ('Earned Leave', 15, true, 8, true, false),
  ('Unpaid Leave', 30, false, 0, false, false)
ON CONFLICT (name) DO NOTHING;

-- Seed departments
INSERT INTO departments (name, description)
VALUES
  ('Human Resources', 'People operations and employee lifecycle'),
  ('Engineering', 'Product and technology'),
  ('Finance', 'Payroll, accounts and compliance'),
  ('Operations', 'Day-to-day company operations'),
  ('Academics', 'Student programs and faculty')
ON CONFLICT (name) DO NOTHING;

-- Seed designations (linked where department exists)
INSERT INTO designations (title, department_id, grade)
SELECT v.title, d.id, v.grade
FROM (VALUES
  ('HR Manager', 'Human Resources', 'M2'),
  ('HR Executive', 'Human Resources', 'E1'),
  ('Software Engineer', 'Engineering', 'E2'),
  ('Tech Lead', 'Engineering', 'M1'),
  ('Accountant', 'Finance', 'E1'),
  ('Finance Manager', 'Finance', 'M2'),
  ('Operations Executive', 'Operations', 'E1'),
  ('Faculty', 'Academics', 'E2')
) AS v(title, dept, grade)
JOIN departments d ON d.name = v.dept
WHERE NOT EXISTS (
  SELECT 1 FROM designations x WHERE x.title = v.title
);
