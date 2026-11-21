BEGIN;

CREATE TABLE IF NOT EXISTS public.school_announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
    category text NOT NULL DEFAULT 'news'
        CHECK (category IN ('news', 'announcement', 'event', 'alert')),
    content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 4000),
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_announcements_school_created_idx
    ON public.school_announcements (school_id, created_at DESC);

ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.school_announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_announcements TO service_role;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) THEN
        RAISE EXCEPTION 'Supabase realtime publication is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'school_announcements'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.school_announcements;
    END IF;
END
$$;

COMMIT;
