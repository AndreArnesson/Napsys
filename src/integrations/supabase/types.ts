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
          confidence_level: number | null
          created_at: string
          discount_rate: number | null
          estimation_mode: string | null
          growth_rate: number | null
          id: string
          intrinsic_value: number | null
          is_draft: boolean
          margin_assumption: number | null
          margin_of_safety: number | null
          rating: string | null
          summary_comment: string | null
          target_ev_ebit: number | null
          target_pe: number | null
          terminal_growth_rate: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          confidence_level?: number | null
          created_at?: string
          discount_rate?: number | null
          estimation_mode?: string | null
          growth_rate?: number | null
          id?: string
          intrinsic_value?: number | null
          is_draft?: boolean
          margin_assumption?: number | null
          margin_of_safety?: number | null
          rating?: string | null
          summary_comment?: string | null
          target_ev_ebit?: number | null
          target_pe?: number | null
          terminal_growth_rate?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          confidence_level?: number | null
          created_at?: string
          discount_rate?: number | null
          estimation_mode?: string | null
          growth_rate?: number | null
          id?: string
          intrinsic_value?: number | null
          is_draft?: boolean
          margin_assumption?: number | null
          margin_of_safety?: number | null
          rating?: string | null
          summary_comment?: string | null
          target_ev_ebit?: number | null
          target_pe?: number | null
          terminal_growth_rate?: number | null
          updated_at?: string
          user_id?: string
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
          cash_equivalents: number | null
          company_id: string
          created_at: string
          current_assets: number | null
          current_liabilities: number | null
          current_ratio: number | null
          debt_to_equity: number | null
          equity_ratio: number | null
          fiscal_year: number
          id: string
          long_term_debt: number | null
          quick_ratio: number | null
          shareholders_equity: number | null
          short_term_debt: number | null
          total_assets: number | null
          total_liabilities: number | null
        }
        Insert: {
          cash_equivalents?: number | null
          company_id: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          current_ratio?: number | null
          debt_to_equity?: number | null
          equity_ratio?: number | null
          fiscal_year: number
          id?: string
          long_term_debt?: number | null
          quick_ratio?: number | null
          shareholders_equity?: number | null
          short_term_debt?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
        }
        Update: {
          cash_equivalents?: number | null
          company_id?: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          current_ratio?: number | null
          debt_to_equity?: number | null
          equity_ratio?: number | null
          fiscal_year?: number
          id?: string
          long_term_debt?: number | null
          quick_ratio?: number | null
          shareholders_equity?: number | null
          short_term_debt?: number | null
          total_assets?: number | null
          total_liabilities?: number | null
        }
        Relationships: [
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
          board_members: Json | null
          created_at: string
          current_price: number | null
          description: string | null
          id: string
          management: string | null
          moats: string | null
          name: string
          reporting_currency: string
          shares_outstanding: number | null
          ticker: string | null
          trading_currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          board_members?: Json | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          id?: string
          management?: string | null
          moats?: string | null
          name: string
          reporting_currency?: string
          shares_outstanding?: number | null
          ticker?: string | null
          trading_currency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          board_members?: Json | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          id?: string
          management?: string | null
          moats?: string | null
          name?: string
          reporting_currency?: string
          shares_outstanding?: number | null
          ticker?: string | null
          trading_currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      income_statement: {
        Row: {
          company_id: string
          created_at: string
          ebit: number | null
          ebitda: number | null
          fiscal_year: number
          gross_margin: number | null
          id: string
          net_income: number | null
          net_margin: number | null
          operating_margin: number | null
          revenue: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          ebit?: number | null
          ebitda?: number | null
          fiscal_year: number
          gross_margin?: number | null
          id?: string
          net_income?: number | null
          net_margin?: number | null
          operating_margin?: number | null
          revenue?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          ebit?: number | null
          ebitda?: number | null
          fiscal_year?: number
          gross_margin?: number | null
          id?: string
          net_income?: number | null
          net_margin?: number | null
          operating_margin?: number | null
          revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "income_statement_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_currency: string
          default_language: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          default_language?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          default_language?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quarterly_estimates: {
        Row: {
          analysis_id: string
          created_at: string
          ebit: number | null
          id: string
          quarter: number
          revenue: number | null
          year: number
        }
        Insert: {
          analysis_id: string
          created_at?: string
          ebit?: number | null
          id?: string
          quarter: number
          revenue?: number | null
          year: number
        }
        Update: {
          analysis_id?: string
          created_at?: string
          ebit?: number | null
          id?: string
          quarter?: number
          revenue?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_estimates_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      shares: {
        Row: {
          company_id: string
          created_at: string
          id: string
          owner_id: string
          permission: string
          shared_with_email: string
          shared_with_user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          owner_id: string
          permission?: string
          shared_with_email: string
          shared_with_user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          permission?: string
          shared_with_email?: string
          shared_with_user_id?: string | null
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
          analysis_id: string | null
          comment: string | null
          company_id: string
          created_at: string
          event_date: string
          event_type: string
          id: string
          insider_data: Json | null
          rating: string | null
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          comment?: string | null
          company_id: string
          created_at?: string
          event_date?: string
          event_type: string
          id?: string
          insider_data?: Json | null
          rating?: string | null
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          comment?: string | null
          company_id?: string
          created_at?: string
          event_date?: string
          event_type?: string
          id?: string
          insider_data?: Json | null
          rating?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_company_id_fkey"
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
      [_ in never]: never
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
