-- ============================================================
-- PREVENT CONVERSATION DUPLICATION RACE CONDITIONS
-- ============================================================

-- 1. Identify and resolve existing duplicate active/waiting conversations
-- We keep the oldest one active and resolve the newer ones.
UPDATE public.conversations
SET status = 'resolved', resolved_at = now()
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY contact_id, whatsapp_instance_id ORDER BY started_at ASC) as rn
    FROM public.conversations
    WHERE status IN ('waiting', 'active')
  ) duplicates
  WHERE rn > 1
);

-- 2. Create a partial unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_conversation 
ON public.conversations (contact_id, whatsapp_instance_id) 
WHERE status IN ('waiting', 'active');
