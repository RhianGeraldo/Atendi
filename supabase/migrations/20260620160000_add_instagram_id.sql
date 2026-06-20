-- Migration to add instagram_id to contacts

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram_id TEXT;

-- Update the merge_contacts RPC to also handle instagram_id
CREATE OR REPLACE FUNCTION merge_contacts(source_id UUID, target_id UUID)
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

  -- Update target with source's instagram_username if target doesn't have one
  UPDATE public.contacts
  SET instagram_username = COALESCE(public.contacts.instagram_username, (SELECT instagram_username FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Update target with source's instagram_id if target doesn't have one
  UPDATE public.contacts
  SET instagram_id = COALESCE(public.contacts.instagram_id, (SELECT instagram_id FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Update target with source's whatsapp_lid if target doesn't have one
  UPDATE public.contacts
  SET whatsapp_lid = COALESCE(public.contacts.whatsapp_lid, (SELECT whatsapp_lid FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Update target with source's phone if target doesn't have one
  UPDATE public.contacts
  SET phone = COALESCE(public.contacts.phone, (SELECT phone FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Mark source as merged into target
  UPDATE public.contacts
  SET merged_into_id = target_id
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
