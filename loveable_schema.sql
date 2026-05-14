--
-- PostgreSQL database dump
--

\restrict 01LZX0Fb46KEgYm3htyG4b8t9HtuFLSJFpJAc3bvFiRWOVobeeYMPi76h6M9m7K

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: is_shared_with_user(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_shared_with_user(_company_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shares
    WHERE company_id = _company_id
      AND shared_with_user_id = _user_id
  )
$$;


--
-- Name: prevent_locked_analysis_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_locked_analysis_update() RETURNS trigger
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


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analyses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rating text,
    summary_comment text,
    margin_of_safety numeric,
    is_draft boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_price numeric,
    shares_outstanding bigint,
    name text,
    images jsonb DEFAULT '[]'::jsonb,
    employees integer,
    visible_sections jsonb DEFAULT '{"debt": true, "images": true, "employees": false}'::jsonb,
    projections jsonb DEFAULT '[]'::jsonb,
    adjustments jsonb DEFAULT '[]'::jsonb,
    imported boolean DEFAULT false NOT NULL,
    locked boolean DEFAULT false NOT NULL
);


--
-- Name: balance_sheet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_sheet (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year integer NOT NULL,
    total_assets numeric,
    total_liabilities numeric,
    shareholders_equity numeric,
    current_assets numeric,
    current_liabilities numeric,
    long_term_debt numeric,
    cash_equivalents numeric,
    equity_ratio numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    short_term_debt numeric,
    analysis_id uuid
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    ticker text,
    current_price numeric,
    shares_outstanding bigint,
    trading_currency text DEFAULT 'SEK'::text,
    reporting_currency text DEFAULT 'SEK'::text,
    description text,
    moats text,
    management jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    images jsonb DEFAULT '[]'::jsonb,
    pilotskolan text,
    founded_year integer,
    business_model text,
    visible_sections jsonb DEFAULT '{"ceo": true, "moats": true, "images": true, "management": true, "competition": false, "description": true, "foundedYear": false, "pilotskolan": true, "businessModel": false, "insiderOwnership": true}'::jsonb,
    competition text,
    financial_summary text,
    insider_summary text,
    exchange text DEFAULT 'stockholm'::text,
    insider_ownership jsonb DEFAULT '[]'::jsonb,
    balance_sheet_summary text,
    ownership_description text,
    company_type text DEFAULT 'stock'::text NOT NULL
);


--
-- Name: economy_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.economy_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    category text DEFAULT 'bank_account'::text NOT NULL,
    label text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: income_statement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.income_statement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year integer NOT NULL,
    revenue numeric,
    ebit numeric,
    ebitda numeric,
    net_income numeric,
    gross_margin numeric,
    operating_margin numeric,
    net_margin numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dividend numeric,
    earnings_per_share numeric,
    shares_outstanding bigint,
    analysis_id uuid
);


--
-- Name: insider_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insider_trades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    date text NOT NULL,
    person text NOT NULL,
    "position" text DEFAULT ''::text NOT NULL,
    type text NOT NULL,
    volume numeric DEFAULT 0 NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SEK'::text NOT NULL,
    instrument text,
    isin text,
    nature text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: portfolio_holdings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_holdings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid NOT NULL,
    company_name text,
    ticker text,
    weight_percent numeric,
    value_sek numeric,
    conviction text,
    rationale text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    price numeric,
    shares_count numeric,
    future_plan text
);


--
-- Name: portfolio_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    portfolio_id uuid NOT NULL,
    snapshot_date date DEFAULT CURRENT_DATE NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: portfolios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: price_fetch_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_fetch_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    ticker text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved boolean DEFAULT false NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    display_name text,
    default_currency text DEFAULT 'SEK'::text,
    default_language text DEFAULT 'sv'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quarterly_balance_sheet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quarterly_balance_sheet (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    analysis_id uuid,
    fiscal_year integer NOT NULL,
    quarter integer NOT NULL,
    total_assets numeric,
    total_liabilities numeric,
    shareholders_equity numeric,
    current_assets numeric,
    current_liabilities numeric,
    long_term_debt numeric,
    short_term_debt numeric,
    cash_equivalents numeric,
    equity_ratio numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quarterly_balance_sheet_quarter_check CHECK (((quarter >= 1) AND (quarter <= 4)))
);


--
-- Name: quarterly_income_statement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quarterly_income_statement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    analysis_id uuid,
    fiscal_year integer NOT NULL,
    quarter integer NOT NULL,
    revenue numeric,
    ebit numeric,
    ebitda numeric,
    net_income numeric,
    earnings_per_share numeric,
    dividend numeric,
    gross_margin numeric,
    operating_margin numeric,
    net_margin numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quarterly_income_statement_quarter_check CHECK (((quarter >= 1) AND (quarter <= 4)))
);


--
-- Name: report_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    analysis_id uuid,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_size integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    shared_with_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: timeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_date date,
    rating text,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ticker text NOT NULL,
    company_name text,
    company_id uuid,
    conviction text,
    notes text,
    buy_more boolean DEFAULT false NOT NULL,
    ai_impact text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_columns jsonb DEFAULT '{}'::jsonb
);


--
-- Name: analyses analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_pkey PRIMARY KEY (id);


--
-- Name: balance_sheet balance_sheet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_sheet
    ADD CONSTRAINT balance_sheet_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: economy_entries economy_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.economy_entries
    ADD CONSTRAINT economy_entries_pkey PRIMARY KEY (id);


--
-- Name: income_statement income_statement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.income_statement
    ADD CONSTRAINT income_statement_pkey PRIMARY KEY (id);


--
-- Name: insider_trades insider_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insider_trades
    ADD CONSTRAINT insider_trades_pkey PRIMARY KEY (id);


--
-- Name: portfolio_holdings portfolio_holdings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_holdings
    ADD CONSTRAINT portfolio_holdings_pkey PRIMARY KEY (id);


--
-- Name: portfolio_snapshots portfolio_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_snapshots
    ADD CONSTRAINT portfolio_snapshots_pkey PRIMARY KEY (id);


--
-- Name: portfolios portfolios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolios
    ADD CONSTRAINT portfolios_pkey PRIMARY KEY (id);


--
-- Name: price_fetch_errors price_fetch_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_fetch_errors
    ADD CONSTRAINT price_fetch_errors_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: quarterly_balance_sheet quarterly_balance_sheet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_balance_sheet
    ADD CONSTRAINT quarterly_balance_sheet_pkey PRIMARY KEY (id);


--
-- Name: quarterly_income_statement quarterly_income_statement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_income_statement
    ADD CONSTRAINT quarterly_income_statement_pkey PRIMARY KEY (id);


--
-- Name: report_documents report_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_documents
    ADD CONSTRAINT report_documents_pkey PRIMARY KEY (id);


--
-- Name: shares shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_pkey PRIMARY KEY (id);


--
-- Name: timeline_events timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_events
    ADD CONSTRAINT timeline_events_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (id);


--
-- Name: idx_price_fetch_errors_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_fetch_errors_unresolved ON public.price_fetch_errors USING btree (resolved, created_at DESC) WHERE (resolved = false);


--
-- Name: analyses prevent_locked_analysis_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_locked_analysis_update_trigger BEFORE UPDATE ON public.analyses FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_analysis_update();


--
-- Name: analyses update_analyses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_analyses_updated_at BEFORE UPDATE ON public.analyses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: companies update_companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: watchlist update_watchlist_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_watchlist_updated_at BEFORE UPDATE ON public.watchlist FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: analyses analyses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: balance_sheet balance_sheet_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_sheet
    ADD CONSTRAINT balance_sheet_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.analyses(id) ON DELETE CASCADE;


--
-- Name: balance_sheet balance_sheet_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_sheet
    ADD CONSTRAINT balance_sheet_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: income_statement income_statement_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.income_statement
    ADD CONSTRAINT income_statement_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.analyses(id) ON DELETE CASCADE;


--
-- Name: income_statement income_statement_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.income_statement
    ADD CONSTRAINT income_statement_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: insider_trades insider_trades_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insider_trades
    ADD CONSTRAINT insider_trades_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: portfolio_holdings portfolio_holdings_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_holdings
    ADD CONSTRAINT portfolio_holdings_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.portfolio_snapshots(id) ON DELETE CASCADE;


--
-- Name: portfolio_snapshots portfolio_snapshots_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_snapshots
    ADD CONSTRAINT portfolio_snapshots_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id) ON DELETE CASCADE;


--
-- Name: price_fetch_errors price_fetch_errors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_fetch_errors
    ADD CONSTRAINT price_fetch_errors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: quarterly_balance_sheet quarterly_balance_sheet_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_balance_sheet
    ADD CONSTRAINT quarterly_balance_sheet_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.analyses(id) ON DELETE CASCADE;


--
-- Name: quarterly_balance_sheet quarterly_balance_sheet_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_balance_sheet
    ADD CONSTRAINT quarterly_balance_sheet_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: quarterly_income_statement quarterly_income_statement_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_income_statement
    ADD CONSTRAINT quarterly_income_statement_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.analyses(id) ON DELETE CASCADE;


--
-- Name: quarterly_income_statement quarterly_income_statement_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarterly_income_statement
    ADD CONSTRAINT quarterly_income_statement_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: report_documents report_documents_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_documents
    ADD CONSTRAINT report_documents_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.analyses(id) ON DELETE SET NULL;


--
-- Name: report_documents report_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_documents
    ADD CONSTRAINT report_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: shares shares_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: timeline_events timeline_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_events
    ADD CONSTRAINT timeline_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: price_fetch_errors Service role can insert price fetch errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert price fetch errors" ON public.price_fetch_errors FOR INSERT WITH CHECK (true);


--
-- Name: analyses Users can create analyses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create analyses" ON public.analyses FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: companies Users can create companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create companies" ON public.companies FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: economy_entries Users can create own economy entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own economy entries" ON public.economy_entries FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: portfolio_holdings Users can create own holdings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own holdings" ON public.portfolio_holdings FOR INSERT WITH CHECK ((snapshot_id IN ( SELECT ps.id
   FROM (public.portfolio_snapshots ps
     JOIN public.portfolios p ON ((ps.portfolio_id = p.id)))
  WHERE (p.user_id = auth.uid()))));


--
-- Name: portfolios Users can create own portfolios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own portfolios" ON public.portfolios FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: portfolio_snapshots Users can create own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own snapshots" ON public.portfolio_snapshots FOR INSERT WITH CHECK ((portfolio_id IN ( SELECT portfolios.id
   FROM public.portfolios
  WHERE (portfolios.user_id = auth.uid()))));


--
-- Name: shares Users can create shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create shares" ON public.shares FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: analyses Users can delete own analyses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own analyses" ON public.analyses FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: balance_sheet Users can delete own balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own balance data" ON public.balance_sheet FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: companies Users can delete own companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own companies" ON public.companies FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: economy_entries Users can delete own economy entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own economy entries" ON public.economy_entries FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: portfolio_holdings Users can delete own holdings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own holdings" ON public.portfolio_holdings FOR DELETE USING ((snapshot_id IN ( SELECT ps.id
   FROM (public.portfolio_snapshots ps
     JOIN public.portfolios p ON ((ps.portfolio_id = p.id)))
  WHERE (p.user_id = auth.uid()))));


--
-- Name: income_statement Users can delete own income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own income data" ON public.income_statement FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: insider_trades Users can delete own insider trades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own insider trades" ON public.insider_trades FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: portfolios Users can delete own portfolios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own portfolios" ON public.portfolios FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: quarterly_balance_sheet Users can delete own quarterly balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own quarterly balance data" ON public.quarterly_balance_sheet FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: quarterly_income_statement Users can delete own quarterly income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own quarterly income data" ON public.quarterly_income_statement FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: report_documents Users can delete own report documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own report documents" ON public.report_documents FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: portfolio_snapshots Users can delete own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own snapshots" ON public.portfolio_snapshots FOR DELETE USING ((portfolio_id IN ( SELECT portfolios.id
   FROM public.portfolios
  WHERE (portfolios.user_id = auth.uid()))));


--
-- Name: timeline_events Users can delete own timeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own timeline" ON public.timeline_events FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: watchlist Users can delete own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own watchlist" ON public.watchlist FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: shares Users can delete shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete shares" ON public.shares FOR DELETE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: report_documents Users can insert own report documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own report documents" ON public.report_documents FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: watchlist Users can insert own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own watchlist" ON public.watchlist FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: balance_sheet Users can manage own balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own balance data" ON public.balance_sheet FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: income_statement Users can manage own income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own income data" ON public.income_statement FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: insider_trades Users can manage own insider trades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own insider trades" ON public.insider_trades FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: quarterly_balance_sheet Users can manage own quarterly balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own quarterly balance data" ON public.quarterly_balance_sheet FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: quarterly_income_statement Users can manage own quarterly income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own quarterly income data" ON public.quarterly_income_statement FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: timeline_events Users can manage own timeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own timeline" ON public.timeline_events FOR INSERT WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: analyses Users can update own analyses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own analyses" ON public.analyses FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: balance_sheet Users can update own balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own balance data" ON public.balance_sheet FOR UPDATE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: companies Users can update own companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own companies" ON public.companies FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: economy_entries Users can update own economy entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own economy entries" ON public.economy_entries FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: portfolio_holdings Users can update own holdings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own holdings" ON public.portfolio_holdings FOR UPDATE USING ((snapshot_id IN ( SELECT ps.id
   FROM (public.portfolio_snapshots ps
     JOIN public.portfolios p ON ((ps.portfolio_id = p.id)))
  WHERE (p.user_id = auth.uid()))));


--
-- Name: income_statement Users can update own income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own income data" ON public.income_statement FOR UPDATE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: insider_trades Users can update own insider trades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own insider trades" ON public.insider_trades FOR UPDATE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: portfolios Users can update own portfolios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own portfolios" ON public.portfolios FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: price_fetch_errors Users can update own price fetch errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own price fetch errors" ON public.price_fetch_errors FOR UPDATE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: quarterly_balance_sheet Users can update own quarterly balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own quarterly balance data" ON public.quarterly_balance_sheet FOR UPDATE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: quarterly_income_statement Users can update own quarterly income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own quarterly income data" ON public.quarterly_income_statement FOR UPDATE USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: portfolio_snapshots Users can update own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own snapshots" ON public.portfolio_snapshots FOR UPDATE USING ((portfolio_id IN ( SELECT portfolios.id
   FROM public.portfolios
  WHERE (portfolios.user_id = auth.uid()))));


--
-- Name: watchlist Users can update own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own watchlist" ON public.watchlist FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: analyses Users can view own analyses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own analyses" ON public.analyses FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: balance_sheet Users can view own balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own balance data" ON public.balance_sheet FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: companies Users can view own companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own companies" ON public.companies FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: economy_entries Users can view own economy entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own economy entries" ON public.economy_entries FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: portfolio_holdings Users can view own holdings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own holdings" ON public.portfolio_holdings FOR SELECT USING ((snapshot_id IN ( SELECT ps.id
   FROM (public.portfolio_snapshots ps
     JOIN public.portfolios p ON ((ps.portfolio_id = p.id)))
  WHERE (p.user_id = auth.uid()))));


--
-- Name: income_statement Users can view own income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own income data" ON public.income_statement FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: insider_trades Users can view own insider trades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own insider trades" ON public.insider_trades FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: portfolios Users can view own portfolios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own portfolios" ON public.portfolios FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: price_fetch_errors Users can view own price fetch errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own price fetch errors" ON public.price_fetch_errors FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: quarterly_balance_sheet Users can view own quarterly balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own quarterly balance data" ON public.quarterly_balance_sheet FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: quarterly_income_statement Users can view own quarterly income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own quarterly income data" ON public.quarterly_income_statement FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: report_documents Users can view own report documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own report documents" ON public.report_documents FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: shares Users can view own shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own shares" ON public.shares FOR SELECT USING ((shared_with_user_id = auth.uid()));


--
-- Name: portfolio_snapshots Users can view own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own snapshots" ON public.portfolio_snapshots FOR SELECT USING ((portfolio_id IN ( SELECT portfolios.id
   FROM public.portfolios
  WHERE (portfolios.user_id = auth.uid()))));


--
-- Name: timeline_events Users can view own timeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own timeline" ON public.timeline_events FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: watchlist Users can view own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own watchlist" ON public.watchlist FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: analyses Users can view shared analyses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared analyses" ON public.analyses FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: balance_sheet Users can view shared balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared balance data" ON public.balance_sheet FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: companies Users can view shared companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared companies" ON public.companies FOR SELECT USING (public.is_shared_with_user(id, auth.uid()));


--
-- Name: income_statement Users can view shared income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared income data" ON public.income_statement FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: insider_trades Users can view shared insider trades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared insider trades" ON public.insider_trades FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: quarterly_balance_sheet Users can view shared quarterly balance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared quarterly balance data" ON public.quarterly_balance_sheet FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: quarterly_income_statement Users can view shared quarterly income data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared quarterly income data" ON public.quarterly_income_statement FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: report_documents Users can view shared report documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared report documents" ON public.report_documents FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: timeline_events Users can view shared timeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared timeline" ON public.timeline_events FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));


--
-- Name: shares Users can view shares they created; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shares they created" ON public.shares FOR SELECT USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: analyses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

--
-- Name: balance_sheet; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.balance_sheet ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: economy_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.economy_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: income_statement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.income_statement ENABLE ROW LEVEL SECURITY;

--
-- Name: insider_trades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insider_trades ENABLE ROW LEVEL SECURITY;

--
-- Name: portfolio_holdings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;

--
-- Name: portfolio_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: portfolios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

--
-- Name: price_fetch_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_fetch_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: quarterly_balance_sheet; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quarterly_balance_sheet ENABLE ROW LEVEL SECURITY;

--
-- Name: quarterly_income_statement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quarterly_income_statement ENABLE ROW LEVEL SECURITY;

--
-- Name: report_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 01LZX0Fb46KEgYm3htyG4b8t9HtuFLSJFpJAc3bvFiRWOVobeeYMPi76h6M9m7K

