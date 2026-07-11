export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      business_units: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          business_unit_id: string | null;
          full_name: string | null;
          email: string | null;
          role: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          business_unit_id?: string | null;
          full_name?: string | null;
          email?: string | null;
          role?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_unit_id?: string | null;
          full_name?: string | null;
          email?: string | null;
          role?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          business_unit_id: string | null;
          name: string;
          status: string;
          occupancy: number;
          check_ins_today: number;
          check_outs_today: number;
          pending_guest_messages: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_unit_id?: string | null;
          name: string;
          status?: string;
          occupancy?: number;
          check_ins_today?: number;
          check_outs_today?: number;
          pending_guest_messages?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_unit_id?: string | null;
          name?: string;
          status?: string;
          occupancy?: number;
          check_ins_today?: number;
          check_outs_today?: number;
          pending_guest_messages?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          business_unit_id: string | null;
          name: string;
          unit: string;
          status: string;
          current_task: string | null;
          last_active_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_unit_id?: string | null;
          name: string;
          unit?: string;
          status?: string;
          current_task?: string | null;
          last_active_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_unit_id?: string | null;
          name?: string;
          unit?: string;
          status?: string;
          current_task?: string | null;
          last_active_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          business_unit_id: string | null;
          title: string;
          unit: string;
          owner: string;
          status: string;
          priority: string;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_unit_id?: string | null;
          title: string;
          unit?: string;
          owner?: string;
          status?: string;
          priority?: string;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_unit_id?: string | null;
          title?: string;
          unit?: string;
          owner?: string;
          status?: string;
          priority?: string;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      approvals: {
        Row: {
          id: string;
          business_unit_id: string | null;
          title: string;
          summary: string | null;
          unit: string;
          requested_by: string;
          approved_by: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_unit_id?: string | null;
          title: string;
          summary?: string | null;
          unit?: string;
          requested_by?: string;
          approved_by?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_unit_id?: string | null;
          title?: string;
          summary?: string | null;
          unit?: string;
          requested_by?: string;
          approved_by?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      activity_logs: {
        Row: {
          id: string;
          business_unit_id: string | null;
          agent: string;
          unit: string;
          message: string;
          type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_unit_id?: string | null;
          agent: string;
          unit?: string;
          message: string;
          type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_unit_id?: string | null;
          agent?: string;
          unit?: string;
          message?: string;
          type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      sync_sources: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          business_unit_id: string | null;
          sheet_id: string | null;
          sheet_range: string | null;
          supports_incremental: boolean;
          schedule_enabled: boolean;
          schedule_interval_minutes: number | null;
          status: string;
          last_synced_at: string | null;
          last_cursor: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          business_unit_id?: string | null;
          sheet_id?: string | null;
          sheet_range?: string | null;
          supports_incremental?: boolean;
          schedule_enabled?: boolean;
          schedule_interval_minutes?: number | null;
          status?: string;
          last_synced_at?: string | null;
          last_cursor?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          description?: string | null;
          business_unit_id?: string | null;
          sheet_id?: string | null;
          sheet_range?: string | null;
          supports_incremental?: boolean;
          schedule_enabled?: boolean;
          schedule_interval_minutes?: number | null;
          status?: string;
          last_synced_at?: string | null;
          last_cursor?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sync_runs: {
        Row: {
          id: string;
          source_id: string;
          trigger: string;
          status: string;
          triggered_by: string | null;
          records_seen: number;
          records_created: number;
          records_updated: number;
          records_skipped: number;
          records_failed: number;
          error_message: string | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          trigger: string;
          status?: string;
          triggered_by?: string | null;
          records_seen?: number;
          records_created?: number;
          records_updated?: number;
          records_skipped?: number;
          records_failed?: number;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string;
          trigger?: string;
          status?: string;
          triggered_by?: string | null;
          records_seen?: number;
          records_created?: number;
          records_updated?: number;
          records_skipped?: number;
          records_failed?: number;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      import_logs: {
        Row: {
          id: string;
          sync_run_id: string;
          level: string;
          message: string;
          context: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sync_run_id: string;
          level?: string;
          message: string;
          context?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sync_run_id?: string;
          level?: string;
          message?: string;
          context?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sync_records: {
        Row: {
          id: string;
          source_key: string;
          external_id: string;
          target_table: string | null;
          target_id: string | null;
          data: Json;
          synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_key: string;
          external_id: string;
          target_table?: string | null;
          target_id?: string | null;
          data?: Json;
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_key?: string;
          external_id?: string;
          target_table?: string | null;
          target_id?: string | null;
          data?: Json;
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_oauth_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          google_email: string | null;
          access_token: string | null;
          refresh_token: string | null;
          token_type: string | null;
          scope: string | null;
          access_token_expires_at: string | null;
          connected_at: string;
          updated_at: string;
          last_refresh_at: string | null;
          last_error: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider?: string;
          google_email?: string | null;
          access_token?: string | null;
          refresh_token?: string | null;
          token_type?: string | null;
          scope?: string | null;
          access_token_expires_at?: string | null;
          connected_at?: string;
          updated_at?: string;
          last_refresh_at?: string | null;
          last_error?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          google_email?: string | null;
          access_token?: string | null;
          refresh_token?: string | null;
          token_type?: string | null;
          scope?: string | null;
          access_token_expires_at?: string | null;
          connected_at?: string;
          updated_at?: string;
          last_refresh_at?: string | null;
          last_error?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
