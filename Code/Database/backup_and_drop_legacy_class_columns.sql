BEGIN;

CREATE TABLE IF NOT EXISTS public.users_legacy_class_backup (
    user_id uuid PRIMARY KEY,
    email text,
    enrolled_classes jsonb,
    taught_classes jsonb,
    backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.users_legacy_class_backup (
    user_id,
    email,
    enrolled_classes,
    taught_classes
)
SELECT
    id,
    email,
    to_jsonb("enrolledClasses"),
    to_jsonb("taughtClasses")
FROM public.users
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.users_legacy_class_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users_legacy_class_backup FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users_legacy_class_backup TO service_role;

ALTER TABLE public.users
    DROP COLUMN IF EXISTS "enrolledClasses",
    DROP COLUMN IF EXISTS "taughtClasses";

COMMIT;
