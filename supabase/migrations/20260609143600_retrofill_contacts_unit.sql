UPDATE public.contacts c
SET unit_id = (
  SELECT unit_id
  FROM public.conversations conv
  WHERE conv.contact_id = c.id
  ORDER BY started_at DESC
  LIMIT 1
)
WHERE c.unit_id IS NULL;
