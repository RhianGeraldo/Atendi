-- Migration to support Omnichannel Contact Merging

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram_username TEXT;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS remote_id TEXT;

-- Data migration: set remote_id for existing conversations
UPDATE public.conversations c
SET remote_id = (SELECT whatsapp_lid FROM public.contacts WHERE id = c.contact_id)
WHERE c.remote_id IS NULL;

-- Create an RPC to safely merge contacts
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

  -- Mark source as merged into target
  UPDATE public.contacts
  SET merged_into_id = target_id
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
