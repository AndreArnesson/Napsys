-- Expire report files and their metadata after 30 days.
CREATE INDEX IF NOT EXISTS report_documents_created_at_idx
  ON public.report_documents (created_at);

DO $$
DECLARE
  cleanup_token text;
BEGIN
  SELECT decrypted_secret
    INTO cleanup_token
    FROM vault.decrypted_secrets
   WHERE name = 'report_cleanup_token'
   LIMIT 1;

  IF cleanup_token IS NULL THEN
    RAISE EXCEPTION 'Vault secret report_cleanup_token must be created before scheduling report cleanup';
  END IF;

  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'daily-report-cleanup';

  PERFORM cron.schedule(
    'daily-report-cleanup',
    '0 3 * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ymwrlclbovmipkwgvqgw.supabase.co/functions/v1/cleanup-old-reports',
      headers := (
        SELECT jsonb_build_object(
          'Content-Type', 'application/json',
          'x-report-cleanup-token', decrypted_secret
        )
        FROM vault.decrypted_secrets
        WHERE name = 'report_cleanup_token'
        LIMIT 1
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
    $job$
  );
END
$$;
