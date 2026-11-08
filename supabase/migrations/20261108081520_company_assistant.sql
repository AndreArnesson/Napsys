BEGIN;

-- This feature is additive. Disabling its settings leaves the original company
-- card and analysis data untouched.
CREATE TABLE public.company_ai_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  chat_enabled boolean NOT NULL DEFAULT true,
  news_enabled boolean NOT NULL DEFAULT false,
  feed_urls text[] NOT NULL DEFAULT '{}',
  last_news_checked_at timestamptz,
  last_news_error text,
  news_summary text,
  news_paused_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_ai_feed_count CHECK (cardinality(feed_urls) <= 5),
  CONSTRAINT company_ai_feed_shape CHECK (array_position(feed_urls, NULL) IS NULL),
  CONSTRAINT company_ai_feed_size CHECK (octet_length(array_to_string(feed_urls, '')) <= 10240)
);

CREATE FUNCTION public.touch_company_ai_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_company_ai_settings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER company_ai_settings_updated_at BEFORE UPDATE ON public.company_ai_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_company_ai_settings();

CREATE TABLE public.company_chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 4000),
  answer text NOT NULL CHECK (char_length(btrim(answer)) BETWEEN 1 AND 30000),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_chat_turns_company_user_created_idx
  ON public.company_chat_turns (company_id, user_id, created_at DESC);
CREATE INDEX company_chat_turns_user_id_idx ON public.company_chat_turns (user_id);

CREATE TABLE public.company_news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 4096),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 1000),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 300),
  summary text CHECK (char_length(summary) <= 12000),
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, url)
);
CREATE INDEX company_news_items_company_published_idx
  ON public.company_news_items (company_id, published_at DESC NULLS LAST, fetched_at DESC);

ALTER TABLE public.company_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_news_items ENABLE ROW LEVEL SECURITY;

-- Subqueries deliberately use companies' current RLS. They include direct
-- shares and share-all access and disappear as soon as that access is revoked.
CREATE POLICY "Readers can view company assistant settings"
ON public.company_ai_settings FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM public.companies));
CREATE POLICY "Owners can create company assistant settings"
ON public.company_ai_settings FOR INSERT TO authenticated
WITH CHECK (company_id IN (
  SELECT id FROM public.companies WHERE user_id = (SELECT auth.uid())
));
CREATE POLICY "Owners can update company assistant settings"
ON public.company_ai_settings FOR UPDATE TO authenticated
USING (company_id IN (
  SELECT id FROM public.companies WHERE user_id = (SELECT auth.uid())
))
WITH CHECK (company_id IN (
  SELECT id FROM public.companies WHERE user_id = (SELECT auth.uid())
));
CREATE POLICY "Users can view their own accessible company conversations"
ON public.company_chat_turns FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND company_id IN (SELECT id FROM public.companies));
CREATE POLICY "Users can delete their own accessible company conversations"
ON public.company_chat_turns FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND company_id IN (SELECT id FROM public.companies));
CREATE POLICY "Readers can view company news"
ON public.company_news_items FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM public.companies));

-- Remove Supabase's possible default table grants before granting only the
-- browser operations required by this feature. AI results are server-written.
REVOKE ALL ON public.company_ai_settings, public.company_chat_turns,
  public.company_news_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_ai_settings, public.company_chat_turns,
  public.company_news_items TO authenticated;
GRANT INSERT (company_id, chat_enabled, news_enabled, feed_urls)
  ON public.company_ai_settings TO authenticated;
GRANT UPDATE (chat_enabled, news_enabled, feed_urls)
  ON public.company_ai_settings TO authenticated;
GRANT DELETE ON public.company_chat_turns TO authenticated;
GRANT ALL ON public.company_ai_settings, public.company_chat_turns,
  public.company_news_items TO service_role;

CREATE FUNCTION public.set_company_ai_settings(
  _company_id uuid,
  _chat_enabled boolean,
  _news_enabled boolean,
  _feed_urls text[]
) RETURNS public.company_ai_settings
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  settings public.company_ai_settings;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id AND user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only the company owner can change assistant settings' USING ERRCODE = '42501';
  END IF;
  IF _chat_enabled IS NULL OR _news_enabled IS NULL OR _feed_urls IS NULL
    OR cardinality(_feed_urls) > 5 OR array_position(_feed_urls, NULL) IS NOT NULL
    OR EXISTS (SELECT 1 FROM unnest(_feed_urls) AS feed(url)
      WHERE char_length(url) > 2048 OR url !~ '^https://[^[:space:]]+$')
  THEN
    RAISE EXCEPTION 'Provide at most five HTTPS feed URLs' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.company_ai_settings (company_id, chat_enabled, news_enabled, feed_urls)
  VALUES (_company_id, _chat_enabled, _news_enabled, _feed_urls)
  ON CONFLICT (company_id) DO NOTHING;
  UPDATE public.company_ai_settings
  SET chat_enabled = _chat_enabled, news_enabled = _news_enabled, feed_urls = _feed_urls
  WHERE company_id = _company_id RETURNING * INTO settings;
  RETURN settings;
END;
$$;
REVOKE ALL ON FUNCTION public.set_company_ai_settings(uuid, boolean, boolean, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_ai_settings(uuid, boolean, boolean, text[])
  TO authenticated;

-- These private tables are used only by Edge Functions with a service key.
-- Reservations count even if the provider fails: retries cannot silently spend
-- the allowance repeatedly, and concurrent requests cannot bypass the cap.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.company_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('chat', 'news')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_ai_usage_created_idx ON private.company_ai_usage (created_at);
CREATE INDEX company_ai_usage_user_created_idx ON private.company_ai_usage (user_id, created_at);
CREATE INDEX company_ai_usage_company_idx ON private.company_ai_usage (company_id);
CREATE TABLE private.company_ai_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  paused_until timestamptz
);
INSERT INTO private.company_ai_state (singleton) VALUES (true);
ALTER TABLE private.company_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.company_ai_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.company_ai_usage, private.company_ai_state FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON private.company_ai_usage, private.company_ai_state TO service_role;

CREATE FUNCTION public.claim_company_ai_request(
  _company_id uuid,
  _user_id uuid DEFAULT NULL,
  _purpose text DEFAULT 'chat'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  checked_at timestamptz;
  day_start timestamptz;
  day_end timestamptz;
  paused_until timestamptz;
  usage_count bigint;
  retry_at timestamptz;
BEGIN
  IF _purpose NOT IN ('chat', 'news') OR _purpose IS NULL
    OR (_purpose = 'chat' AND _user_id IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id)
  THEN
    RAISE EXCEPTION 'Invalid company AI reservation' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(1851876211);
  checked_at := clock_timestamp();
  day_start := (checked_at AT TIME ZONE 'America/Los_Angeles')::date::timestamp
    AT TIME ZONE 'America/Los_Angeles';
  day_end := ((checked_at AT TIME ZONE 'America/Los_Angeles')::date + 1)::timestamp
    AT TIME ZONE 'America/Los_Angeles';
  DELETE FROM private.company_ai_usage WHERE created_at < checked_at - interval '3 days';
  SELECT s.paused_until INTO paused_until FROM private.company_ai_state s WHERE s.singleton;
  IF paused_until > checked_at THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exhausted',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch FROM paused_until - checked_at))::integer));
  END IF;
  SELECT count(*) INTO usage_count FROM private.company_ai_usage WHERE created_at >= day_start;
  IF usage_count >= 50 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'project_daily_limit',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch FROM day_end - checked_at))::integer));
  END IF;
  SELECT count(*), min(created_at + interval '1 minute') INTO usage_count, retry_at
    FROM private.company_ai_usage WHERE created_at > checked_at - interval '1 minute';
  IF usage_count >= 5 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'project_rate_limit',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch FROM retry_at - checked_at))::integer));
  END IF;
  IF _purpose = 'chat' THEN
    SELECT count(*) INTO usage_count FROM private.company_ai_usage
      WHERE user_id = _user_id AND purpose = 'chat' AND created_at >= day_start;
    IF usage_count >= 20 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'user_daily_limit',
        'retryAfterSeconds', greatest(1, ceil(extract(epoch FROM day_end - checked_at))::integer));
    END IF;
    SELECT count(*), min(created_at + interval '1 minute') INTO usage_count, retry_at
      FROM private.company_ai_usage
      WHERE user_id = _user_id AND purpose = 'chat' AND created_at > checked_at - interval '1 minute';
    IF usage_count >= 2 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'user_rate_limit',
        'retryAfterSeconds', greatest(1, ceil(extract(epoch FROM retry_at - checked_at))::integer));
    END IF;
  END IF;
  INSERT INTO private.company_ai_usage (company_id, user_id, purpose, created_at)
  VALUES (_company_id, _user_id, _purpose, checked_at);
  RETURN jsonb_build_object('allowed', true, 'reason', NULL, 'retryAfterSeconds', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_company_ai_request(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_company_ai_request(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.pause_company_ai(_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(1851876211);
  UPDATE private.company_ai_state
  SET paused_until = greatest(coalesce(paused_until, clock_timestamp()),
    clock_timestamp() + make_interval(secs => greatest(60, least(coalesce(_seconds, 3600), 93600))))
  WHERE singleton;
END;
$$;
REVOKE ALL ON FUNCTION public.pause_company_ai(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_company_ai(integer) TO service_role;

COMMENT ON TABLE public.company_chat_turns IS
  'Private per-user conversations; reading requires current access to the company.';
COMMENT ON FUNCTION public.claim_company_ai_request(uuid, uuid, text) IS
  'Atomic conservative app limits for Gemini Free Tier. These limits do not upgrade billing or guarantee provider capacity.';

COMMIT;
