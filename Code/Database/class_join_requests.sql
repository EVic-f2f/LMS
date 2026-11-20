CREATE TABLE IF NOT EXISTS public.class_join_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS class_join_requests_class_status_idx
    ON public.class_join_requests (class_id, status);

CREATE INDEX IF NOT EXISTS class_join_requests_student_status_idx
    ON public.class_join_requests (student_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS class_join_requests_one_pending_idx
    ON public.class_join_requests (class_id, student_id)
    WHERE status = 'pending';
