-- ============================================================
-- SAFE PATCH: Group Chat Mobile Visibility Compatibility
--
-- This script is conservative and production-safe:
-- - Keeps your website table structure and chat flow untouched.
-- - Ensures every group creator is also a member/admin.
-- - Replaces ONLY the recursive members SELECT policy with an equivalent
--   non-recursive check (common mobile visibility issue).
-- - Adds a read-only RPC fallback that mobile can call if needed.
-- ============================================================

-- ---------- Non-recursive helper ----------

CREATE OR REPLACE FUNCTION public.is_group_member_fast(
  p_group_conversation_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_conversation_members gcm
    WHERE gcm.group_conversation_id = p_group_conversation_id
      AND gcm.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_group_member_fast(uuid, uuid) TO authenticated;

-- ---------- Optional RPC fallback for mobile ----------

CREATE OR REPLACE FUNCTION public.my_group_memberships(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  group_conversation_id uuid,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gcm.group_conversation_id, gcm.role
  FROM public.group_conversation_members gcm
  WHERE gcm.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.my_group_memberships(uuid) TO authenticated;

-- ---------- Ensure creator is always member/admin ----------

CREATE OR REPLACE FUNCTION public.ensure_group_creator_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_conversation_members (
    group_conversation_id,
    user_id,
    role
  )
  VALUES (
    NEW.id,
    NEW.created_by,
    'admin'
  )
  ON CONFLICT (group_conversation_id, user_id)
  DO UPDATE SET role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_conversations_add_creator_member
ON public.group_conversations;

CREATE TRIGGER trg_group_conversations_add_creator_member
AFTER INSERT ON public.group_conversations
FOR EACH ROW
EXECUTE FUNCTION public.ensure_group_creator_member();

-- ---------- Backfill existing creator memberships ----------

INSERT INTO public.group_conversation_members (
  group_conversation_id,
  user_id,
  role
)
SELECT
  gc.id,
  gc.created_by,
  'admin'
FROM public.group_conversations gc
ON CONFLICT (group_conversation_id, user_id)
DO UPDATE SET role = EXCLUDED.role;

-- ---------- Targeted policy fix (only one policy updated) ----------

-- Replace recursive self-reference policy with non-recursive helper.
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.group_conversation_members;

CREATE POLICY "Users can view members of their groups"
ON public.group_conversation_members
FOR SELECT
USING (public.is_group_member_fast(group_conversation_id));

-- ---------- Optional checks (safe read-only) ----------
-- Uncomment to inspect what changed:
--
-- SELECT
--   gc.id AS group_id,
--   gc.created_by,
--   gcm.user_id AS creator_membership_user,
--   gcm.role AS creator_membership_role
-- FROM public.group_conversations gc
-- LEFT JOIN public.group_conversation_members gcm
--   ON gcm.group_conversation_id = gc.id
--  AND gcm.user_id = gc.created_by
-- ORDER BY gc.created_at DESC
-- LIMIT 200;
