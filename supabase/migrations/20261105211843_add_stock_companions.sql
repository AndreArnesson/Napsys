BEGIN;

CREATE TABLE public.stock_companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CHECK (requester_id <> recipient_id),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL))
);
CREATE UNIQUE INDEX stock_companions_pair_key ON public.stock_companions
  (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
CREATE INDEX stock_companions_requester_idx ON public.stock_companions (requester_id);
CREATE INDEX stock_companions_recipient_idx ON public.stock_companions (recipient_id);

-- A directed grant: one companion sharing everything does not share the other's data.
CREATE TABLE public.companion_all_shares (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.stock_companions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, companion_id),
  CHECK (owner_id <> companion_id)
);
CREATE INDEX companion_all_shares_recipient_idx ON public.companion_all_shares (companion_id);
CREATE INDEX companion_all_shares_connection_idx ON public.companion_all_shares (connection_id);

ALTER TABLE public.stock_companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_all_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can read companion connections" ON public.stock_companions
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (requester_id, recipient_id));
CREATE POLICY "Participants can read all-analysis grants" ON public.companion_all_shares
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (owner_id, companion_id));
REVOKE ALL ON public.stock_companions, public.companion_all_shares FROM anon, authenticated;
GRANT SELECT ON public.stock_companions, public.companion_all_shares TO authenticated;

CREATE FUNCTION private.request_stock_companion(_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_id uuid;
  connection_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO target_id FROM auth.users
  WHERE lower(email) = lower(btrim(_email)) AND deleted_at IS NULL;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_id = caller_id THEN
    RAISE EXCEPTION 'Cannot add yourself' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.stock_companions (requester_id, recipient_id)
  VALUES (caller_id, target_id)
  ON CONFLICT DO NOTHING RETURNING id INTO connection_id;
  IF connection_id IS NULL THEN
    RAISE EXCEPTION 'Already companions or request pending' USING ERRCODE = '23505';
  END IF;
  RETURN connection_id;
END;
$$;

CREATE FUNCTION private.respond_stock_companion(_connection_id uuid, _accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL OR _accept IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.stock_companions
    WHERE id = _connection_id AND recipient_id = caller_id AND status = 'pending'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Only the recipient can respond to a pending request' USING ERRCODE = '42501';
  END IF;
  IF _accept THEN
    UPDATE public.stock_companions SET status = 'accepted', accepted_at = now()
    WHERE id = _connection_id;
  ELSE
    DELETE FROM public.stock_companions WHERE id = _connection_id;
  END IF;
END;
$$;

CREATE FUNCTION private.remove_stock_companion(_connection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
  connection public.stock_companions%ROWTYPE;
BEGIN
  SELECT * INTO connection FROM public.stock_companions
  WHERE id = _connection_id AND caller_id IN (requester_id, recipient_id) FOR UPDATE;
  IF caller_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'Only a participant can remove this connection' USING ERRCODE = '42501';
  END IF;
  IF connection.status = 'accepted' THEN
    DELETE FROM public.shares s USING public.companies c
    WHERE s.company_id = c.id AND (
      (c.user_id = connection.requester_id AND s.shared_with_user_id = connection.recipient_id)
      OR (c.user_id = connection.recipient_id AND s.shared_with_user_id = connection.requester_id)
    );
  END IF;
  -- Deletes both directions of all-analysis grants via the foreign key.
  DELETE FROM public.stock_companions WHERE id = _connection_id;
END;
$$;

CREATE FUNCTION private.set_companion_share_all(_companion_id uuid, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
  connection_id uuid;
BEGIN
  SELECT id INTO connection_id FROM public.stock_companions
  WHERE status = 'accepted' AND (
    (requester_id = caller_id AND recipient_id = _companion_id)
    OR (recipient_id = caller_id AND requester_id = _companion_id)
  ) FOR UPDATE;
  IF caller_id IS NULL OR connection_id IS NULL OR _enabled IS NULL THEN
    RAISE EXCEPTION 'Choose an accepted companion' USING ERRCODE = '42501';
  END IF;
  IF _enabled THEN
    INSERT INTO public.companion_all_shares (owner_id, companion_id, connection_id)
    VALUES (caller_id, _companion_id, connection_id)
    ON CONFLICT (owner_id, companion_id) DO NOTHING;
  ELSE
    DELETE FROM public.companion_all_shares WHERE owner_id = caller_id AND companion_id = _companion_id;
  END IF;
END;
$$;

CREATE FUNCTION private.list_stock_companions()
RETURNS TABLE (
  id uuid, user_id uuid, email text, display_name text, status text,
  incoming boolean, sharing_all boolean, receiving_all boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT f.id, u.id, u.email::text, p.display_name, f.status,
    f.recipient_id = caller_id,
    EXISTS (SELECT 1 FROM public.companion_all_shares g WHERE g.owner_id = caller_id AND g.companion_id = u.id),
    EXISTS (SELECT 1 FROM public.companion_all_shares g WHERE g.owner_id = u.id AND g.companion_id = caller_id)
  FROM public.stock_companions f
  JOIN auth.users u ON u.id = CASE WHEN f.requester_id = caller_id THEN f.recipient_id ELSE f.requester_id END
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE caller_id IN (f.requester_id, f.recipient_id) AND u.deleted_at IS NULL
  ORDER BY f.created_at, f.id;
END;
$$;

CREATE FUNCTION private.share_company_with_companion(_company_id uuid, _companion_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller_id uuid := auth.uid();
  connection_id uuid;
  recipient_email text;
  share_id uuid;
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id = _company_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Only the company owner can share' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO connection_id FROM public.stock_companions
  WHERE status = 'accepted' AND (
    (requester_id = caller_id AND recipient_id = _companion_id)
    OR (recipient_id = caller_id AND requester_id = _companion_id)
  ) FOR UPDATE;
  IF connection_id IS NULL THEN
    RAISE EXCEPTION 'Choose an accepted companion' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO recipient_email FROM auth.users WHERE id = _companion_id AND deleted_at IS NULL;
  IF recipient_email IS NULL THEN
    RAISE EXCEPTION 'Recipient not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.shares (company_id, owner_id, shared_with_email, shared_with_user_id, permission)
  VALUES (_company_id, caller_id, recipient_email, _companion_id, 'read')
  ON CONFLICT (company_id, shared_with_user_id) DO NOTHING RETURNING id INTO share_id;
  IF share_id IS NULL THEN
    SELECT id INTO share_id FROM public.shares
    WHERE company_id = _company_id AND shared_with_user_id = _companion_id;
  END IF;
  RETURN share_id;
END;
$$;

-- Keep the old RPC for existing clients, with the same companion checks.
CREATE OR REPLACE FUNCTION private.share_company_with_email(_company_id uuid, _email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller_id uuid := auth.uid(); target_id uuid;
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id = _company_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Only the company owner can share' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO target_id FROM auth.users WHERE lower(email) = lower(btrim(_email)) AND deleted_at IS NULL;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN private.share_company_with_companion(_company_id, target_id);
END;
$$;

-- This lookup bypasses RLS internally to avoid recursion through companies.
-- Requiring the current user's ID prevents probing other users' access.
CREATE FUNCTION private.has_shared_company_access(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _user_id = (SELECT auth.uid()) AND (
    EXISTS (SELECT 1 FROM public.shares s WHERE s.company_id = _company_id AND s.shared_with_user_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.companion_all_shares g ON g.owner_id = c.user_id
      JOIN public.stock_companions f ON f.id = g.connection_id AND f.status = 'accepted'
      WHERE c.id = _company_id AND g.companion_id = _user_id
    )
  );
$$;
CREATE OR REPLACE FUNCTION public.is_shared_with_user(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.has_shared_company_access(_company_id, _user_id);
$$;

CREATE FUNCTION public.request_stock_companion(_email text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.request_stock_companion(_email); $$;
CREATE FUNCTION public.respond_stock_companion(_connection_id uuid, _accept boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.respond_stock_companion(_connection_id, _accept); $$;
CREATE FUNCTION public.remove_stock_companion(_connection_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.remove_stock_companion(_connection_id); $$;
CREATE FUNCTION public.set_companion_share_all(_companion_id uuid, _enabled boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.set_companion_share_all(_companion_id, _enabled); $$;
CREATE FUNCTION public.list_stock_companions()
RETURNS TABLE (id uuid, user_id uuid, email text, display_name text, status text, incoming boolean, sharing_all boolean, receiving_all boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT * FROM private.list_stock_companions(); $$;
CREATE FUNCTION public.share_company_with_companion(_company_id uuid, _companion_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.share_company_with_companion(_company_id, _companion_id); $$;

REVOKE ALL ON FUNCTION private.request_stock_companion(text), private.respond_stock_companion(uuid, boolean),
  private.remove_stock_companion(uuid), private.set_companion_share_all(uuid, boolean), private.list_stock_companions(),
  private.share_company_with_companion(uuid, uuid), private.has_shared_company_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.request_stock_companion(text), private.respond_stock_companion(uuid, boolean),
  private.remove_stock_companion(uuid), private.set_companion_share_all(uuid, boolean), private.list_stock_companions(),
  private.share_company_with_companion(uuid, uuid), private.has_shared_company_access(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_stock_companion(text), public.respond_stock_companion(uuid, boolean),
  public.remove_stock_companion(uuid), public.set_companion_share_all(uuid, boolean), public.list_stock_companions(),
  public.share_company_with_companion(uuid, uuid), public.is_shared_with_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_stock_companion(text), public.respond_stock_companion(uuid, boolean),
  public.remove_stock_companion(uuid), public.set_companion_share_all(uuid, boolean), public.list_stock_companions(),
  public.share_company_with_companion(uuid, uuid), public.is_shared_with_user(uuid, uuid) TO authenticated;

COMMIT;
