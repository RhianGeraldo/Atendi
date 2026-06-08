ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_message_preview TEXT;

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Update last message preview
  UPDATE public.conversations
  SET last_message_preview = NEW.content,
      last_message_at = NEW.created_at,
      unread_count = CASE 
        WHEN NEW.sender_type = 'contact' THEN unread_count + 1 
        ELSE unread_count 
      END
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_inserted ON public.messages;
CREATE TRIGGER on_message_inserted
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_on_message();

-- Reset unread count function
CREATE OR REPLACE FUNCTION public.reset_unread_count(conv_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.conversations SET unread_count = 0 WHERE id = conv_id;
END;
$$;
