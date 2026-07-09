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
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          role?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
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
      ai_agents: {
        Row: {
          id: string;
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
      hospitality_properties: {
        Row: {
          id: string;
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
      activity_logs: {
        Row: {
          id: string;
          agent: string;
          unit: string;
          message: string;
          type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent: string;
          unit?: string;
          message: string;
          type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent?: string;
          unit?: string;
          message?: string;
          type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      knowledge_sources: {
        Row: {
          id: string;
          title: string;
          source_type: string;
          url: string | null;
          status: string;
          synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          source_type?: string;
          url?: string | null;
          status?: string;
          synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          source_type?: string;
          url?: string | null;
          status?: string;
          synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
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
