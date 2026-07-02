SELECT 
    c.id, 
    c.status, 
    c.channel,
    c.started_at,
    c.last_message_preview,
    c.unit_id,
    c.whatsapp_instance_id,
    c.assigned_agent_id,
    co.name as contact_name
FROM public.conversations c
JOIN public.contacts co ON c.contact_id = co.id
WHERE co.name ILIKE '%Ana Clara%'
ORDER BY c.started_at DESC
LIMIT 10;
