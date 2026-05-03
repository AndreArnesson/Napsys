
-- Create report_documents table
CREATE TABLE IF NOT EXISTS public.report_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.report_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can manage reports for their own companies
CREATE POLICY "Users can view own report documents"
  ON public.report_documents FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own report documents"
  ON public.report_documents FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own report documents"
  ON public.report_documents FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Shared access
CREATE POLICY "Users can view shared report documents"
  ON public.report_documents FOR SELECT
  USING (is_shared_with_user(company_id, auth.uid()));

-- Storage bucket for reports
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

-- Storage RLS: users can upload to their company folders
CREATE POLICY "Users can upload reports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can read own reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own reports"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'reports' AND auth.uid() IS NOT NULL);
