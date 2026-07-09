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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
