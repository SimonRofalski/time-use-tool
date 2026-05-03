-- Enable per-course release toggle for the course comparison view.

ALTER TABLE public.course
ADD COLUMN IF NOT EXISTS comparison_enabled boolean NOT NULL DEFAULT false;
