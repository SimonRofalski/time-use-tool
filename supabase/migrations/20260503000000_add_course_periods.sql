-- ─── course_period: flexible multi-period scheduling per course ───────────────
-- A course can now span one or more non-overlapping date ranges (periods).
-- Existing courses are backfilled: their start_date / end_date becomes period 0.
-- The legacy start_date / end_date columns on course are kept for ordering
-- and backward-compat queries; they store the overall span (min/max).

CREATE TABLE IF NOT EXISTS public.course_period (
  course_period_id  serial       PRIMARY KEY,
  course_id         integer      NOT NULL
                                 REFERENCES public.course(course_id)
                                 ON DELETE CASCADE,
  start_date        date         NOT NULL,
  end_date          date         NOT NULL,
  sort_order        integer      NOT NULL DEFAULT 0,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT course_period_valid_range CHECK (end_date >= start_date)
);

-- Index for fast per-course lookups (ordered by sort_order for display)
CREATE INDEX IF NOT EXISTS idx_course_period_course_id
  ON public.course_period (course_id, sort_order);

-- Backfill: create one period per existing course that already has dates
INSERT INTO public.course_period (course_id, start_date, end_date, sort_order)
SELECT course_id,
       start_date::date,
       end_date::date,
       0
FROM   public.course
WHERE  start_date IS NOT NULL
  AND  end_date   IS NOT NULL;

-- ─── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.course_period ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read periods (needed for enrollment display and user views)
CREATE POLICY "Authenticated users can read course_period"
  ON public.course_period FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can create, modify, or delete periods
CREATE POLICY "Admins can insert course_period"
  ON public.course_period FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update course_period"
  ON public.course_period FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete course_period"
  ON public.course_period FOR DELETE
  TO authenticated
  USING (public.is_admin());
