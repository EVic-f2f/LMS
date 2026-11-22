BEGIN;

ALTER TABLE public.school_announcements
    ADD COLUMN IF NOT EXISTS image_path text;

COMMIT;
