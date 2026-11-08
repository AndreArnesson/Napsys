BEGIN;

-- Retain the Edge gateway's JWT verification. The legacy anon key here is
-- public and only passes the gateway: the function separately verifies the
-- private company_news_cron_token before it can use scheduler privileges.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'company_news_gateway_key') THEN
    RAISE EXCEPTION 'Store the project public legacy anon key in company_news_gateway_key before scheduling';
  END IF;

  PERFORM cron.schedule(
    'company-news-hourly',
    '17 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ymwrlclbovmipkwgvqgw.supabase.co/functions/v1/company-news',
      headers := (
        SELECT jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', gateway.decrypted_secret,
          'Authorization', 'Bearer ' || gateway.decrypted_secret,
          'x-company-news-token', scheduler.decrypted_secret
        )
        FROM vault.decrypted_secrets scheduler
        CROSS JOIN vault.decrypted_secrets gateway
        WHERE scheduler.name = 'company_news_cron_token'
          AND gateway.name = 'company_news_gateway_key'
        LIMIT 1
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
    $job$
  );
  PERFORM cron.alter_job(
    job_id := (SELECT jobid FROM cron.job WHERE jobname = 'company-news-hourly'),
    active := false
  );
END;
$$;

COMMIT;
