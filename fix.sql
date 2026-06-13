ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_remote_msg_id_key;
ALTER TABLE messages ADD CONSTRAINT messages_remote_msg_id_conversation_id_key UNIQUE (remote_msg_id, conversation_id);
