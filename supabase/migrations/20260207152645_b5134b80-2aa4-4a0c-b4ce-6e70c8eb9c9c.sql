-- Create profiles table for user settings and preferences
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  default_language TEXT NOT NULL DEFAULT 'sv',
  default_currency TEXT NOT NULL DEFAULT 'SEK',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ticker TEXT,
  description TEXT,
  moats TEXT,
  management TEXT,
  board_members JSONB DEFAULT '[]'::jsonb,
  reporting_currency TEXT NOT NULL DEFAULT 'SEK',
  trading_currency TEXT NOT NULL DEFAULT 'SEK',
  shares_outstanding BIGINT,
  current_price DECIMAL(18,4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Companies policies (own + shared)
CREATE POLICY "Users can view their own companies" 
ON public.companies FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own companies" 
ON public.companies FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own companies" 
ON public.companies FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own companies" 
ON public.companies FOR DELETE 
USING (auth.uid() = user_id);

-- Create analyses table
CREATE TABLE public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating TEXT CHECK (rating IN ('buy', 'hold', 'sell')),
  confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 5),
  summary_comment TEXT,
  estimation_mode TEXT CHECK (estimation_mode IN ('quick', 'detailed')) DEFAULT 'quick',
  growth_rate DECIMAL(8,4),
  margin_assumption DECIMAL(8,4),
  discount_rate DECIMAL(8,4) DEFAULT 0.10,
  terminal_growth_rate DECIMAL(8,4) DEFAULT 0.02,
  target_pe DECIMAL(8,2),
  target_ev_ebit DECIMAL(8,2),
  intrinsic_value DECIMAL(18,4),
  margin_of_safety DECIMAL(8,4),
  is_draft BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on analyses
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- Analyses policies
CREATE POLICY "Users can view their own analyses" 
ON public.analyses FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analyses" 
ON public.analyses FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyses" 
ON public.analyses FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses" 
ON public.analyses FOR DELETE 
USING (auth.uid() = user_id);

-- Create quarterly_estimates table for detailed mode
CREATE TABLE public.quarterly_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  revenue DECIMAL(18,2),
  ebit DECIMAL(18,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on quarterly_estimates
ALTER TABLE public.quarterly_estimates ENABLE ROW LEVEL SECURITY;

-- Quarterly estimates policies via analysis ownership
CREATE POLICY "Users can view their quarterly estimates" 
ON public.quarterly_estimates FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.analyses 
  WHERE id = quarterly_estimates.analysis_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can insert their quarterly estimates" 
ON public.quarterly_estimates FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.analyses 
  WHERE id = quarterly_estimates.analysis_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can update their quarterly estimates" 
ON public.quarterly_estimates FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.analyses 
  WHERE id = quarterly_estimates.analysis_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can delete their quarterly estimates" 
ON public.quarterly_estimates FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.analyses 
  WHERE id = quarterly_estimates.analysis_id 
  AND user_id = auth.uid()
));

-- Create timeline_events table
CREATE TABLE public.timeline_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('analysis', 'comment', 'insider_buy', 'rating_change')),
  rating TEXT CHECK (rating IN ('buy', 'hold', 'sell')),
  comment TEXT,
  insider_data JSONB,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
  event_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on timeline_events
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

-- Timeline events policies
CREATE POLICY "Users can view their timeline events" 
ON public.timeline_events FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their timeline events" 
ON public.timeline_events FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their timeline events" 
ON public.timeline_events FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their timeline events" 
ON public.timeline_events FOR DELETE 
USING (auth.uid() = user_id);

-- Create income_statement table
CREATE TABLE public.income_statement (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  revenue DECIMAL(18,2),
  ebit DECIMAL(18,2),
  ebitda DECIMAL(18,2),
  net_income DECIMAL(18,2),
  gross_margin DECIMAL(8,4),
  operating_margin DECIMAL(8,4),
  net_margin DECIMAL(8,4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, fiscal_year)
);

-- Enable RLS on income_statement
ALTER TABLE public.income_statement ENABLE ROW LEVEL SECURITY;

-- Income statement policies via company ownership
CREATE POLICY "Users can view income statements for their companies" 
ON public.income_statement FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = income_statement.company_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can insert income statements for their companies" 
ON public.income_statement FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = income_statement.company_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can update income statements for their companies" 
ON public.income_statement FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = income_statement.company_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can delete income statements for their companies" 
ON public.income_statement FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = income_statement.company_id 
  AND user_id = auth.uid()
));

-- Create balance_sheet table
CREATE TABLE public.balance_sheet (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  total_assets DECIMAL(18,2),
  total_liabilities DECIMAL(18,2),
  shareholders_equity DECIMAL(18,2),
  current_assets DECIMAL(18,2),
  current_liabilities DECIMAL(18,2),
  long_term_debt DECIMAL(18,2),
  short_term_debt DECIMAL(18,2),
  cash_equivalents DECIMAL(18,2),
  debt_to_equity DECIMAL(8,4),
  current_ratio DECIMAL(8,4),
  quick_ratio DECIMAL(8,4),
  equity_ratio DECIMAL(8,4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, fiscal_year)
);

-- Enable RLS on balance_sheet
ALTER TABLE public.balance_sheet ENABLE ROW LEVEL SECURITY;

-- Balance sheet policies via company ownership
CREATE POLICY "Users can view balance sheets for their companies" 
ON public.balance_sheet FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = balance_sheet.company_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can insert balance sheets for their companies" 
ON public.balance_sheet FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = balance_sheet.company_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can update balance sheets for their companies" 
ON public.balance_sheet FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = balance_sheet.company_id 
  AND user_id = auth.uid()
));

CREATE POLICY "Users can delete balance sheets for their companies" 
ON public.balance_sheet FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE id = balance_sheet.company_id 
  AND user_id = auth.uid()
));

-- Create shares table for sharing analyses
CREATE TABLE public.shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'comment')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on shares
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- Shares policies
CREATE POLICY "Owners can view their shares" 
ON public.shares FOR SELECT 
USING (auth.uid() = owner_id);

CREATE POLICY "Users can view shares shared with them" 
ON public.shares FOR SELECT 
USING (auth.uid() = shared_with_user_id);

CREATE POLICY "Owners can insert shares" 
ON public.shares FOR INSERT 
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete shares" 
ON public.shares FOR DELETE 
USING (auth.uid() = owner_id);

-- Add policies for shared companies
CREATE POLICY "Users can view shared companies" 
ON public.companies FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.shares 
  WHERE company_id = companies.id 
  AND shared_with_user_id = auth.uid()
));

-- Add policies for shared analyses
CREATE POLICY "Users can view shared analyses" 
ON public.analyses FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.shares s
  JOIN public.companies c ON c.id = s.company_id
  WHERE c.id = analyses.company_id 
  AND s.shared_with_user_id = auth.uid()
));

-- Add policies for shared timeline events
CREATE POLICY "Users can view shared timeline events" 
ON public.timeline_events FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.shares s
  WHERE s.company_id = timeline_events.company_id 
  AND s.shared_with_user_id = auth.uid()
));

-- Add policies for shared income statements
CREATE POLICY "Users can view shared income statements" 
ON public.income_statement FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.shares s
  WHERE s.company_id = income_statement.company_id 
  AND s.shared_with_user_id = auth.uid()
));

-- Add policies for shared balance sheets
CREATE POLICY "Users can view shared balance sheets" 
ON public.balance_sheet FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.shares s
  WHERE s.company_id = balance_sheet.company_id 
  AND s.shared_with_user_id = auth.uid()
));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_analyses_updated_at
BEFORE UPDATE ON public.analyses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for company images
INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets', 'company-assets', true);

-- Storage policies for company assets
CREATE POLICY "Users can view all company assets" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'company-assets');

CREATE POLICY "Authenticated users can upload company assets" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'company-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own company assets" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'company-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own company assets" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'company-assets' AND auth.uid()::text = (storage.foldername(name))[1]);