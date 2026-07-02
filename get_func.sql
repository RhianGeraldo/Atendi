SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'user_in_unit';
