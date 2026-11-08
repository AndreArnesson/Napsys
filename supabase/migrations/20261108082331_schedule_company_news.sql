BEGIN;

-- The browser never receives this token. After applying, copy its Vault value
-- into the COMPANY_NEWS_CRON_TOKEN Edge Function secret (see docs/company-assistant.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'company_news_cron_token') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'company_news_cron_token',
      'Private scheduler credential for opted-in Napsys company news'
    );
  END IF;

  -- Dispatch hourly so free-quota pauses, failed feeds and larger watchlists can
  -- catch up. The worker checks each enabled company at most once per 24 hours.
  PERFORM cron.schedule(
    'company-news-hourly',
    '17 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ymwrlclbovmipkwgvqgw.supabase.co/functions/v1/company-news',
      headers := (
        SELECT jsonb_build_object('Content-Type', 'application/json', 'x-company-news-token', decrypted_secret)
        FROM vault.decrypted_secrets WHERE name = 'company_news_cron_token' LIMIT 1
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
    $job$
  );
END;
$$;

COMMIT;
