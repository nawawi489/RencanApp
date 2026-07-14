-- =============================================================================
-- 0058_fix_get_chat_rooms_grant.sql
-- =============================================================================
-- BUGFIX: 0046 recreated get_chat_rooms() via DROP+CREATE without an explicit
-- GRANT EXECUTE TO authenticated (DROP wipes prior ACLs). 0057 then assumed
-- "CREATE OR REPLACE preserves existing authenticated grant" and revoked
-- public/anon on top of that — leaving no role with EXECUTE besides the
-- function owner. Result: every authenticated user got 42501 loading Inbox.
-- =============================================================================

grant execute on function public.get_chat_rooms() to authenticated;
