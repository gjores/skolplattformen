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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assignment_units: {
        Row: {
          assignment_id: string
          unit_id: string
        }
        Insert: {
          assignment_id: string
          unit_id: string
        }
        Update: {
          assignment_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_units_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "school_units"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          id: string
          name: string
          organizer_id: string
          profile_id: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organizer_id: string
          profile_id?: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organizer_id?: string
          profile_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: [
          {
            foreignKeyName: "assignments_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_timplans: {
        Row: {
          class_name: string
          column_id: string
          start_year: number
          timplan_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          class_name: string
          column_id: string
          start_year: number
          timplan_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          class_name?: string
          column_id?: string
          start_year?: number
          timplan_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_timplans_timplan_id_fkey"
            columns: ["timplan_id"]
            isOneToOne: false
            referencedRelation: "timplans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_timplans_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "school_units"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          catalog_fetched: string | null
          cohort: string
          created_at: string
          created_by: string | null
          grades: number[] | null
          id: string
          kind: Database["public"]["Enums"]["offering_kind"]
          local_code: string | null
          name: string
          organizer_id: string
          orientation_code: string | null
          program_code: string | null
          status: Database["public"]["Enums"]["offering_status"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          catalog_fetched?: string | null
          cohort: string
          created_at?: string
          created_by?: string | null
          grades?: number[] | null
          id?: string
          kind: Database["public"]["Enums"]["offering_kind"]
          local_code?: string | null
          name: string
          organizer_id: string
          orientation_code?: string | null
          program_code?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          catalog_fetched?: string | null
          cohort?: string
          created_at?: string
          created_by?: string | null
          grades?: number[] | null
          id?: string
          kind?: Database["public"]["Enums"]["offering_kind"]
          local_code?: string | null
          name?: string
          organizer_id?: string
          orientation_code?: string | null
          program_code?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerings_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "school_units"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_events: {
        Row: {
          action: string
          actor: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment: string
          created_at: string
          id: string
          organizer_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          organizer_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          organizer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_number: string | null
          type: Database["public"]["Enums"]["organizer_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_number?: string | null
          type: Database["public"]["Enums"]["organizer_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_number?: string | null
          type?: Database["public"]["Enums"]["organizer_type"]
        }
        Relationships: []
      }
      permits: {
        Row: {
          created_at: string
          created_by: string | null
          decided: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          issuer: Database["public"]["Enums"]["permit_issuer"]
          offering_id: string
          organizer_id: string
          reference: string
          scope: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          issuer: Database["public"]["Enums"]["permit_issuer"]
          offering_id: string
          organizer_id: string
          reference: string
          scope?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          issuer?: Database["public"]["Enums"]["permit_issuer"]
          offering_id?: string
          organizer_id?: string
          reference?: string
          scope?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permits_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      point_plan_events: {
        Row: {
          action: string
          actor: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment: string
          created_at: string
          id: string
          point_plan_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          point_plan_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          point_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_plan_events_point_plan_id_fkey"
            columns: ["point_plan_id"]
            isOneToOne: false
            referencedRelation: "point_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      point_plans: {
        Row: {
          catalog_fetched: string | null
          created_at: string
          created_by: string | null
          decided_by: string | null
          decided_on: string | null
          id: string
          offering_id: string
          organizer_id: string
          specialization: string[]
          status: Database["public"]["Enums"]["plan_status"]
          updated_at: string
          version: number
        }
        Insert: {
          catalog_fetched?: string | null
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decided_on?: string | null
          id?: string
          offering_id: string
          organizer_id: string
          specialization?: string[]
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          version: number
        }
        Update: {
          catalog_fetched?: string | null
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decided_on?: string | null
          id?: string
          offering_id?: string
          organizer_id?: string
          specialization?: string[]
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "point_plans_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_plans_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          organizer_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          organizer_id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organizer_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      registry_snapshots: {
        Row: {
          fetched_at: string
          fetched_by: string | null
          id: string
          payload: Json
          source_url: string
          unit_code: string
        }
        Insert: {
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          payload: Json
          source_url: string
          unit_code: string
        }
        Update: {
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          payload?: Json
          source_url?: string
          unit_code?: string
        }
        Relationships: []
      }
      school_unit_types: {
        Row: {
          grades: number[] | null
          programmes: string[]
          school_type: string
          unit_id: string
        }
        Insert: {
          grades?: number[] | null
          programmes?: string[]
          school_type: string
          unit_id: string
        }
        Update: {
          grades?: number[] | null
          programmes?: string[]
          school_type?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_unit_types_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "school_units"
            referencedColumns: ["id"]
          },
        ]
      }
      school_units: {
        Row: {
          address: Json | null
          code: string
          created_at: string
          head_master: string | null
          id: string
          locality: string | null
          municipality_code: string
          municipality_name: string | null
          name: string
          organizer_id: string
          pupil_register_source: string
          source_fetched: string | null
          source_modified: string | null
          source_name: string
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          code: string
          created_at?: string
          head_master?: string | null
          id?: string
          locality?: string | null
          municipality_code: string
          municipality_name?: string | null
          name: string
          organizer_id: string
          pupil_register_source?: string
          source_fetched?: string | null
          source_modified?: string | null
          source_name?: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          code?: string
          created_at?: string
          head_master?: string | null
          id?: string
          locality?: string | null
          municipality_code?: string
          municipality_name?: string | null
          name?: string
          organizer_id?: string
          pupil_register_source?: string
          source_fetched?: string | null
          source_modified?: string | null
          source_name?: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_units_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_year_days: {
        Row: {
          day: string
          kind: Database["public"]["Enums"]["school_day_kind"]
          note: string | null
          school_year_id: string
        }
        Insert: {
          day: string
          kind: Database["public"]["Enums"]["school_day_kind"]
          note?: string | null
          school_year_id: string
        }
        Update: {
          day?: string
          kind?: Database["public"]["Enums"]["school_day_kind"]
          note?: string | null
          school_year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_year_days_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_year_events: {
        Row: {
          action: string
          actor: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment: string
          created_at: string
          id: string
          school_year_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          school_year_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          school_year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_year_events_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_year_group_days: {
        Row: {
          cause: Database["public"]["Enums"]["group_off_cause"]
          day: string
          group_key: string
          note: string | null
          school_year_id: string
        }
        Insert: {
          cause: Database["public"]["Enums"]["group_off_cause"]
          day: string
          group_key: string
          note?: string | null
          school_year_id: string
        }
        Update: {
          cause?: Database["public"]["Enums"]["group_off_cause"]
          day?: string
          group_key?: string
          note?: string | null
          school_year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_year_group_days_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_year_short_weeks: {
        Row: {
          column_id: string
          group_key: string
          reason: string
          school_year_id: string
          weekday: number
        }
        Insert: {
          column_id: string
          group_key: string
          reason: string
          school_year_id: string
          weekday: number
        }
        Update: {
          column_id?: string
          group_key?: string
          reason?: string
          school_year_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_year_short_weeks_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_years: {
        Row: {
          created_at: string
          created_by: string | null
          decided_by: string | null
          decided_on: string | null
          ht_end: string
          ht_start: string
          id: string
          organizer_id: string
          start_year: number
          status: Database["public"]["Enums"]["school_year_status"]
          unit_id: string
          updated_at: string
          vt_end: string
          vt_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decided_on?: string | null
          ht_end: string
          ht_start: string
          id?: string
          organizer_id: string
          start_year: number
          status?: Database["public"]["Enums"]["school_year_status"]
          unit_id: string
          updated_at?: string
          vt_end: string
          vt_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decided_on?: string | null
          ht_end?: string
          ht_start?: string
          id?: string
          organizer_id?: string
          start_year?: number
          status?: Database["public"]["Enums"]["school_year_status"]
          unit_id?: string
          updated_at?: string
          vt_end?: string
          vt_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_years_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_years_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "school_units"
            referencedColumns: ["id"]
          },
        ]
      }
      timplan_cells: {
        Row: {
          hours: number[]
          row_id: string
          timplan_id: string
        }
        Insert: {
          hours?: number[]
          row_id: string
          timplan_id: string
        }
        Update: {
          hours?: number[]
          row_id?: string
          timplan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timplan_cells_timplan_id_fkey"
            columns: ["timplan_id"]
            isOneToOne: false
            referencedRelation: "timplans"
            referencedColumns: ["id"]
          },
        ]
      }
      timplan_events: {
        Row: {
          action: string
          actor: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment: string
          created_at: string
          id: string
          timplan_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          timplan_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"]
          comment?: string
          created_at?: string
          id?: string
          timplan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timplan_events_timplan_id_fkey"
            columns: ["timplan_id"]
            isOneToOne: false
            referencedRelation: "timplans"
            referencedColumns: ["id"]
          },
        ]
      }
      timplans: {
        Row: {
          basis: string
          catalog_fetched: string | null
          created_at: string
          created_by: string | null
          decided_by: string | null
          decided_on: string | null
          id: string
          offering_id: string
          organizer_id: string
          status: Database["public"]["Enums"]["timplan_status"]
          updated_at: string
          version: number
        }
        Insert: {
          basis?: string
          catalog_fetched?: string | null
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decided_on?: string | null
          id?: string
          offering_id: string
          organizer_id: string
          status?: Database["public"]["Enums"]["timplan_status"]
          updated_at?: string
          version: number
        }
        Update: {
          basis?: string
          catalog_fetched?: string | null
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          decided_on?: string | null
          id?: string
          offering_id?: string
          organizer_id?: string
          status?: Database["public"]["Enums"]["timplan_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "timplans_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timplans_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      appoint_school_principal: {
        Args: {
          principal_id?: string
          principal_name?: string
          school_id: string
        }
        Returns: string
      }
      bootstrap_demo_profile: {
        Args: { display_name?: string }
        Returns: {
          created_at: string
          id: string
          name: string
          organizer_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      copy_offering_cohort: {
        Args: { source_id: string; target_year: number }
        Returns: string
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_organizer_id: { Args: never; Returns: string }
      hours_in_range: { Args: { h: number[] }; Returns: boolean }
      import_school_unit: {
        Args: {
          principal_id?: string
          principal_name?: string
          registry_payload: Json
          unit_data: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "huvudman" | "rektor" | "administrator" | "larare"
      group_off_cause: "nationellt prov" | "apl" | "friluftsdag" | "annat"
      offering_kind: "grundskola" | "gymnasium" | "introduktionsprogram"
      offering_status: "planerad" | "aktiv" | "avvecklas"
      organizer_type: "Kommun" | "Enskild" | "Region" | "Staten"
      permit_issuer: "Skolinspektionen" | "Skolverket" | "Huvudmannens beslut"
      plan_status: "utkast" | "faststalld" | "ersatt"
      school_day_kind: "lovdag" | "studiedag"
      school_year_status: "utkast" | "forslag" | "atersand" | "faststalld"
      staff_role: "rektor" | "larare"
      timplan_status:
        | "utkast"
        | "forslag"
        | "atersand"
        | "faststalld"
        | "ersatt"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["huvudman", "rektor", "administrator", "larare"],
      group_off_cause: ["nationellt prov", "apl", "friluftsdag", "annat"],
      offering_kind: ["grundskola", "gymnasium", "introduktionsprogram"],
      offering_status: ["planerad", "aktiv", "avvecklas"],
      organizer_type: ["Kommun", "Enskild", "Region", "Staten"],
      permit_issuer: ["Skolinspektionen", "Skolverket", "Huvudmannens beslut"],
      plan_status: ["utkast", "faststalld", "ersatt"],
      school_day_kind: ["lovdag", "studiedag"],
      school_year_status: ["utkast", "forslag", "atersand", "faststalld"],
      staff_role: ["rektor", "larare"],
      timplan_status: ["utkast", "forslag", "atersand", "faststalld", "ersatt"],
    },
  },
} as const
