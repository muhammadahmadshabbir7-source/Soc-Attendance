-- SOC Attendance portal schema

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  designation TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  staff_id INT REFERENCES staff(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL,
  staff_designation TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
  time_in TIME NULL,
  time_out TIME NULL,
  late BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS time_out TIME NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_staff_date
  ON attendance_records (staff_id, date) WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records (date);
CREATE INDEX IF NOT EXISTS idx_attendance_staff ON attendance_records (staff_id);

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  org_name TEXT NOT NULL DEFAULT 'SOC Attendance',
  late_cutoff TIME NOT NULL DEFAULT '09:00',
  grace_minutes INT NOT NULL DEFAULT 10,
  CONSTRAINT settings_singleton CHECK (id = 1)
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
