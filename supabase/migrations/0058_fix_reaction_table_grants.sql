-- Fix missing GRANT SELECT on reaction tables (0055 created RLS policies
-- but never granted SELECT to authenticated, causing PostgREST 403
-- on the chat_message_reactions embed in listChatMessages).

grant select on public.chat_message_reactions to authenticated;
grant select on public.reaction_emojis to authenticated;
