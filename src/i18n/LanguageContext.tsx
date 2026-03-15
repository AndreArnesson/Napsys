import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language } from './translations';

// Create a generic type for translations
type Translations = {
  nav: { dashboard: string; companies: string; settings: string; logout: string; login: string; signup: string };
  auth: { login: string; signup: string; email: string; password: string; confirmPassword: string; forgotPassword: string; noAccount: string; hasAccount: string; signInWithGoogle: string; orContinueWith: string; welcomeBack: string; createAccount: string; loginDescription: string; signupDescription: string };
  dashboard: { title: string; myCompanies: string; sharedWithMe: string; addCompany: string; searchPlaceholder: string; noCompanies: string; noCompaniesDescription: string; lastAnalysis: string; noSharedCompanies: string; noSharedCompaniesDescription: string };
  company: { overview: string; financials: string; balanceSheet: string; analysis: string; notes: string; description: string; moats: string; management: string; board: string; ceo: string; sharesOutstanding: string; currentPrice: string; reportingCurrency: string; tradingCurrency: string; ticker: string; keyData: string; insiders: string; importData: string };
  financials: { incomeStatement: string; balanceSheet: string; revenue: string; ebit: string; ebitda: string; netIncome: string; grossMargin: string; operatingMargin: string; netMargin: string; totalAssets: string; totalLiabilities: string; shareholdersEquity: string; currentAssets: string; currentLiabilities: string; longTermDebt: string; shortTermDebt: string; cashEquivalents: string; debtToEquity: string; currentRatio: string; quickRatio: string; equityRatio: string; fiscalYear: string };
  analysis: { title: string; rating: string; buy: string; hold: string; sell: string; confidence: string; summary: string; estimationMode: string; quickEstimate: string; detailedEstimate: string; growthRate: string; marginAssumption: string; discountRate: string; terminalGrowth: string; targetPE: string; targetEVEBIT: string; intrinsicValue: string; marginOfSafety: string; currentPrice: string; saveAnalysis: string; autosaved: string; draft: string; published: string; estimates: string; projections: string; previousAnalyses: string; newAnalysis: string; historicalData: string };
  mos: { undervalued: string; fair: string; overvalued: string };
  
  sharing: { share: string; shareWith: string; email: string; permission: string; read: string; comment: string; sharedWith: string; noShares: string };
  settings: { title: string; profile: string; preferences: string; language: string; currency: string; theme: string; light: string; dark: string; system: string; displayName: string; save: string };
  common: { save: string; cancel: string; delete: string; edit: string; add: string; search: string; filter: string; loading: string; error: string; success: string; confirm: string; back: string; next: string; close: string; year: string; quarter: string };
  smartPaste: { title: string; description: string; placeholder: string; processing: string; format: string; clear: string };
  portfolio: { title: string; createPortfolio: string; noPortfolios: string; noPortfoliosDescription: string; portfolioName: string; newSnapshot: string; noSnapshots: string; noSnapshotsDescription: string; date: string; comment: string; commentPlaceholder: string; companyName: string; ticker: string; weightPercent: string; valueSek: string; conviction: string; convictionHigh: string; convictionMedium: string; convictionLow: string; rationale: string; notes: string; addHolding: string; importStatement: string; importPreview: string; confirmImport: string; uploadFile: string; freeText: string; uploadDescription: string; clickToUpload: string; freeTextDescription: string; freeTextPlaceholder: string; parseText: string };
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
  defaultLanguage?: Language;
}

export function LanguageProvider({ children, defaultLanguage = 'sv' }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('napsys-language');
      if (stored === 'sv' || stored === 'en') {
        return stored;
      }
    }
    return defaultLanguage;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('napsys-language', lang);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = translations[language] as Translations;

  

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
