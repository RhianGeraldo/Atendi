-- Migration to add messenger_id to contacts

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS messenger_id TEXT;

-- Update the merge_contacts RPC to also handle messenger_id and the extra fields passed by the frontend
CREATE OR REPLACE FUNCTION merge_contacts(
  source_id UUID,
  target_id UUID,
  final_name TEXT DEFAULT NULL,
  final_phone TEXT DEFAULT NULL,
  final_whatsapp_lid TEXT DEFAULT NULL,
  final_instagram_username TEXT DEFAULT NULL,
  final_profile_picture_url TEXT DEFAULT NULL,
  final_messenger_id TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Move all conversations from source to target
  UPDATE public.conversations
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move all messages from source to target
  UPDATE public.messages
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Update target with provided final fields or coalesce
  UPDATE public.contacts
  SET 
    name = COALESCE(final_name, public.contacts.name),
    phone = COALESCE(final_phone, public.contacts.phone, (SELECT phone FROM public.contacts WHERE id = source_id)),
    whatsapp_lid = COALESCE(final_whatsapp_lid, public.contacts.whatsapp_lid, (SELECT whatsapp_lid FROM public.contacts WHERE id = source_id)),
    instagram_username = COALESCE(final_instagram_username, public.contacts.instagram_username, (SELECT instagram_username FROM public.contacts WHERE id = source_id)),
    instagram_id = COALESCE(public.contacts.instagram_id, (SELECT instagram_id FROM public.contacts WHERE id = source_id)),
    messenger_id = COALESCE(final_messenger_id, public.contacts.messenger_id, (SELECT messenger_id FROM public.contacts WHERE id = source_id)),
    profile_picture_url = COALESCE(final_profile_picture_url, public.contacts.profile_picture_url, (SELECT profile_picture_url FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Mark source as merged into target
  UPDATE public.contacts
  SET merged_into_id = target_id
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Data Migration: 
-- Any contact that was created by Messenger has their messenger id inside `whatsapp_lid` and their `source = 'Messenger'`.
-- We will move `whatsapp_lid` to `messenger_id` and clear `whatsapp_lid` for those.

UPDATE public.contacts
SET 
  messenger_id = whatsapp_lid,
  whatsapp_lid = NULL
WHERE source = 'Messenger' AND messenger_id IS NULL AND whatsapp_lid IS NOT NULL;
