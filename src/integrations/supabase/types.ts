export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          company_id: string
          created_at: string
          current_price: number | null
          employees: number | null
          id: string
          images: Json | null
          is_draft: boolean | null
          margin_of_safety: number | null
          name: string | null
          projections: Json | null
          rating: string | null
          shares_outstanding: number | null
          summary_comment: string | null
          updated_at: string
          user_id: string
          visible_sections: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string
          current_price?: number | null
          employees?: number | null
          id?: string
          images?: Json | null
          is_draft?: boolean | null
          margin_of_safety?: number | null
          name?: string | null
          projections?: Json | null
          rating?: string | null
          shares_outstanding?: number | null
          summary_comment?: string | null
          updated_at?: string
          user_id: string
          visible_sections?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string
          current_price?: number | null
          employees?: number | null
          id?: string
          images?: Json | null
          is_draft?: boolean | null
          margin_of_safety?: number | null
          name?: string | null
          projections?: Json | null
          rating?: string | null
          shares_outstanding?: number | null
          summary_comment?: string | null
          updated_at?: string
          user_id?: string
          visible_sections?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_sheet: {
        Row: {
          analysis_id: string | null
          cash_equivalents: number | null
          company_id: string
          created_at: string
          current_assets: number | null
          current_liabilities: number | null
          equity_ratio: number | null
          fiscal_year: number
          id: string
          long_term_debt: number | null
          shareholders_equity: number | null
          short_term_debt: number | null
          total_assets: number | null
          total_liabilities: number | null
        }
        Insert: {
          analysis_id?: string | null
          cash_equivalents?: number | null
          company_id: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          equity_ratio?: number | null
          fiscal_year: number
          id?: string
          long_term_debt?: number | null
          shareholders_equity?: number | null
          short_term_debt?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
        }
        Update: {
          analysis_id?: string | null
          cash_equivalents?: number | null
          company_id?: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          equity_ratio?: number | null
          fiscal_year?: number
          id?: string
          long_term_debt?: number | null
          shareholders_equity?: number | null
          short_term_debt?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_sheet_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_sheet_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          business_model: string | null
          competition: string | null
          created_at: string
          current_price: number | null
          description: string | null
          exchange: string | null
          financial_summary: string | null
          founded_year: number | null
          id: string
          images: Json | null
          insider_ownership: Json | null
          insider_summary: string | null
          management: Json | null
          moats: string | null
          name: string
          pilotskolan: string | null
          reporting_currency: string | null
          shares_outstanding: number | null
          ticker: string | null
          trading_currency: string | null
          updated_at: string
          user_id: string
          visible_sections: Json | null
        }
        Insert: {
          business_model?: string | null
          competition?: string | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          exchange?: string | null
          financial_summary?: string | null
          founded_year?: number | null
          id?: string
          images?: Json | null
          insider_ownership?: Json | null
          insider_summary?: string | null
          management?: Json | null
          moats?: string | null
          name: string
          pilotskolan?: string | null
          reporting_currency?: string | null
          shares_outstanding?: number | null
          ticker?: string | null
          trading_currency?: string | null
          updated_at?: string
          user_id: string
          visible_sections?: Json | null
        }
        Update: {
          business_model?: string | null
          competition?: string | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          exchange?: string | null
          financial_summary?: string | null
          founded_year?: number | null
          id?: string
          images?: Json | null
          insider_ownership?: Json | null
          insider_summary?: string | null
          management?: Json | null
          moats?: string | null
          name?: string
          pilotskolan?: string | null
          reporting_currency?: string | null
          shares_outstanding?: number | null
          ticker?: string | null
          trading_currency?: string | null
          updated_at?: string
          user_id?: string
          visible_sections?: Json | null
        }
        Relationships: []
      }
      income_statement: {
        Row: {
          analysis_id: string | null
          company_id: string
          created_at: string
          dividend: number | null
          earnings_per_share: number | null
          ebit: number | null
          ebitda: number | null
          fiscal_year: number
          gross_margin: number | null
          id: string
          net_income: number | null
          net_margin: number | null
          operating_margin: number | null
          revenue: number | null
          shares_outstanding: number | null
        }
        Insert: {
          analysis_id?: string | null
          company_id: string
          created_at?: string
          dividend?: number | null
          earnings_per_share?: number | null
          ebit?: number | null
          ebitda?: number | null
          fiscal_year: number
          gross_margin?: number | null
          id?: string
          net_income?: number | null
          net_margin?: number | null
          operating_margin?: number | null
          revenue?: number | null
          shares_outstanding?: number | null
        }
        Update: {
          analysis_id?: string | null
          company_id?: string
          created_at?: string
          dividend?: number | null
          earnings_per_share?: number | null
          ebit?: number | null
          ebitda?: number | null
          fiscal_year?: number
          gross_margin?: number | null
          id?: string
          net_income?: number | null
          net_margin?: number | null
          operating_margin?: number | null
          revenue?: number | null
          shares_outstanding?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "income_statement_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_statement_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      insider_trades: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          date: string
          id: string
          instrument: string | null
          isin: string | null
          nature: string | null
          person: string
          position: string
          price: number
          type: string
          volume: number
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          date: string
          id?: string
          instrument?: string | null
          isin?: string | null
          nature?: string | null
          person: string
          position?: string
          price?: number
          type: string
          volume?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          date?: string
          id?: string
          instrument?: string | null
          isin?: string | null
          nature?: string | null
          person?: string
          position?: string
          price?: number
          type?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "insider_trades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_currency: string | null
          default_language: string | null
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_currency?: string | null
          default_language?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_currency?: string | null
          default_language?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quarterly_balance_sheet: {
        Row: {
          analysis_id: string | null
          cash_equivalents: number | null
          company_id: string
          created_at: string
          current_assets: number | null
          current_liabilities: number | null
          equity_ratio: number | null
          fiscal_year: number
          id: string
          long_term_debt: number | null
          quarter: number
          shareholders_equity: number | null
          short_term_debt: number | null
          total_assets: number | null
          total_liabilities: number | null
        }
        Insert: {
          analysis_id?: string | null
          cash_equivalents?: number | null
          company_id: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          equity_ratio?: number | null
          fiscal_year: number
          id?: string
          long_term_debt?: number | null
          quarter: number
          shareholders_equity?: number | null
          short_term_debt?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
        }
        Update: {
          analysis_id?: string | null
          cash_equivalents?: number | null
          company_id?: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          equity_ratio?: number | null
          fiscal_year?: number
          id?: string
          long_term_debt?: number | null
          quarter?: number
          shareholders_equity?: number | null
          short_term_debt?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_balance_sheet_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarterly_balance_sheet_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quarterly_income_statement: {
        Row: {
          analysis_id: string | null
          company_id: string
          created_at: string
          dividend: number | null
          earnings_per_share: number | null
          ebit: number | null
          ebitda: number | null
          fiscal_year: number
          gross_margin: number | null
          id: string
          net_income: number | null
          net_margin: number | null
          operating_margin: number | null
          quarter: number
          revenue: number | null
        }
        Insert: {
          analysis_id?: string | null
          company_id: string
          created_at?: string
          dividend?: number | null
          earnings_per_share?: number | null
          ebit?: number | null
          ebitda?: number | null
          fiscal_year: number
          gross_margin?: number | null
          id?: string
          net_income?: number | null
          net_margin?: number | null
          operating_margin?: number | null
          quarter: number
          revenue?: number | null
        }
        Update: {
          analysis_id?: string | null
          company_id?: string
          created_at?: string
          dividend?: number | null
          earnings_per_share?: number | null
          ebit?: number | null
          ebitda?: number | null
          fiscal_year?: number
          gross_margin?: number | null
          id?: string
          net_income?: number | null
          net_margin?: number | null
          operating_margin?: number | null
          quarter?: number
          revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_income_statement_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarterly_income_statement_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shares: {
        Row: {
          company_id: string
          created_at: string
          id: string
          shared_with_user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          shared_with_user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shares_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          comment: string | null
          company_id: string
          created_at: string
          event_date: string | null
          id: string
          rating: string | null
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          event_date?: string | null
          id?: string
          rating?: string | null
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          event_date?: string | null
          id?: string
          rating?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          ai_impact: string | null
          buy_more: boolean
          company_id: string | null
          company_name: string | null
          conviction: string | null
          created_at: string
          custom_columns: Json | null
          id: string
          notes: string | null
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_impact?: string | null
          buy_more?: boolean
          company_id?: string | null
          company_name?: string | null
          conviction?: string | null
          created_at?: string
          custom_columns?: Json | null
          id?: string
          notes?: string | null
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_impact?: string | null
          buy_more?: boolean
          company_id?: string | null
          company_name?: string | null
          conviction?: string | null
          created_at?: string
          custom_columns?: Json | null
          id?: string
          notes?: string | null
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_shared_with_user: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
