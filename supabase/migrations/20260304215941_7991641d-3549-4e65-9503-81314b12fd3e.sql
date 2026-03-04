
CREATE OR REPLACE FUNCTION public.prevent_locked_analysis_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Allow unlocking (only locked column changes to false)
  IF OLD.locked = true AND NEW.locked = false THEN
    RETURN NEW;
  END IF;
  -- Block all other updates on locked analyses
  IF OLD.locked = true THEN
    RAISE EXCEPTION 'This analysis is locked and cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_locked_analysis_update_trigger
  BEFORE UPDATE ON public.analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_analysis_update();
