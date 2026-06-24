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
  public: {
    Tables: {
      action_plan_instances: {
        Row: {
          action_plan_id: string
          created_at: string
          current_submission_id: string | null
          deadline_at: string
          id: string
          instance_date: string
          instance_time: string
          late_minutes: number | null
          missed_reason: string | null
          organization_id: string
          pic_id: string | null
          repeat_rule_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string | null
          submitted_late: boolean
          updated_at: string
        }
        Insert: {
          action_plan_id: string
          created_at?: string
          current_submission_id?: string | null
          deadline_at: string
          id?: string
          instance_date: string
          instance_time: string
          late_minutes?: number | null
          missed_reason?: string | null
          organization_id: string
          pic_id?: string | null
          repeat_rule_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_late?: boolean
          updated_at?: string
        }
        Update: {
          action_plan_id?: string
          created_at?: string
          current_submission_id?: string | null
          deadline_at?: string
          id?: string
          instance_date?: string
          instance_time?: string
          late_minutes?: number | null
          missed_reason?: string | null
          organization_id?: string
          pic_id?: string | null
          repeat_rule_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_late?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_instances_action_plan_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: false
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_instances_current_submission_fk"
            columns: ["current_submission_id"]
            isOneToOne: false
            referencedRelation: "action_plan_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_instances_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_instances_repeat_rule_id_fkey"
            columns: ["repeat_rule_id"]
            isOneToOne: false
            referencedRelation: "action_plan_repeat_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_instances_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      action_plan_repeat_rules: {
        Row: {
          action_plan_id: string
          created_at: string
          created_by: string | null
          custom_dates: string[] | null
          frequency: string
          grace_period_minutes: number | null
          id: string
          missed_rule: string
          month_days: number[] | null
          organization_id: string
          repeat_end_date: string
          repeat_start_date: string
          time_of_day: string
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          action_plan_id: string
          created_at?: string
          created_by?: string | null
          custom_dates?: string[] | null
          frequency: string
          grace_period_minutes?: number | null
          id?: string
          missed_rule?: string
          month_days?: number[] | null
          organization_id: string
          repeat_end_date: string
          repeat_start_date: string
          time_of_day: string
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          action_plan_id?: string
          created_at?: string
          created_by?: string | null
          custom_dates?: string[] | null
          frequency?: string
          grace_period_minutes?: number | null
          id?: string
          missed_rule?: string
          month_days?: number[] | null
          organization_id?: string
          repeat_end_date?: string
          repeat_start_date?: string
          time_of_day?: string
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_repeat_rules_action_plan_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: true
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_repeat_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_repeat_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      action_plan_result_values: {
        Row: {
          created_at: string
          id: string
          label: string | null
          submission_id: string
          value_text: string | null
          value_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          submission_id: string
          value_text?: string | null
          value_type: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          submission_id?: string
          value_text?: string | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_result_values_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "action_plan_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      action_plan_submissions: {
        Row: {
          action_plan_id: string
          action_plan_instance_id: string | null
          created_at: string
          id: string
          note: string | null
          review_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          submitted_by: string | null
          version_number: number
        }
        Insert: {
          action_plan_id: string
          action_plan_instance_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          submitted_by?: string | null
          version_number: number
        }
        Update: {
          action_plan_id?: string
          action_plan_instance_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          submitted_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_submissions_action_plan_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: false
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_submissions_action_plan_instance_id_fkey"
            columns: ["action_plan_instance_id"]
            isOneToOne: false
            referencedRelation: "action_plan_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      action_plans: {
        Row: {
          created_at: string
          created_by: string | null
          current_submission_id: string | null
          deadline: string | null
          definition_of_done: string | null
          description: string | null
          evidence_required: boolean
          expected_output: string | null
          id: string
          initiative_id: string
          name: string
          organization_id: string
          pic_id: string | null
          priority: string | null
          repeat_setting: string
          result_value_required: boolean
          review_required: boolean
          reviewer_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_submission_id?: string | null
          deadline?: string | null
          definition_of_done?: string | null
          description?: string | null
          evidence_required?: boolean
          expected_output?: string | null
          id?: string
          initiative_id: string
          name: string
          organization_id: string
          pic_id?: string | null
          priority?: string | null
          repeat_setting?: string
          result_value_required?: boolean
          review_required?: boolean
          reviewer_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_submission_id?: string | null
          deadline?: string | null
          definition_of_done?: string | null
          description?: string | null
          evidence_required?: boolean
          expected_output?: string | null
          id?: string
          initiative_id?: string
          name?: string
          organization_id?: string
          pic_id?: string | null
          priority?: string | null
          repeat_setting?: string
          result_value_required?: boolean
          review_required?: boolean
          reviewer_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_current_submission_fk"
            columns: ["current_submission_id"]
            isOneToOne: false
            referencedRelation: "action_plan_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      card_completion_rules: {
        Row: {
          card_type: string
          id: string
          organization_id: string | null
          required_fields: Json
          updated_at: string
        }
        Insert: {
          card_type: string
          id?: string
          organization_id?: string | null
          required_fields?: Json
          updated_at?: string
        }
        Update: {
          card_type?: string
          id?: string
          organization_id?: string | null
          required_fields?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_completion_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      card_guidance_contents: {
        Row: {
          body: string
          card_type: string
          id: string
          organization_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          card_type: string
          id?: string
          organization_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          card_type?: string
          id?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_guidance_contents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reads: {
        Row: {
          chat_message_id: string
          read_at: string
          reader_id: string
        }
        Insert: {
          chat_message_id: string
          read_at?: string
          reader_id: string
        }
        Update: {
          chat_message_id?: string
          read_at?: string
          reader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reads_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_reader_id_fkey"
            columns: ["reader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          author_id: string | null
          body: string
          chat_room_id: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          chat_room_id: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          chat_room_id?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_members: {
        Row: {
          added_at: string
          chat_room_id: string
          member_id: string
        }
        Insert: {
          added_at?: string
          chat_room_id: string
          member_id: string
        }
        Update: {
          added_at?: string
          chat_room_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          id: string
          initiative_id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          initiative_id: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          initiative_id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: true
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_files: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          kind: string
          mime_type: string | null
          storage_path: string | null
          submission_id: string
          text_content: string | null
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          storage_path?: string | null
          submission_id: string
          text_content?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          storage_path?: string | null
          submission_id?: string
          text_content?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "action_plan_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_violations: {
        Row: {
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string | null
          severity: string | null
          user_id: string | null
          violation_type: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string | null
          severity?: string | null
          user_id?: string | null
          violation_type: string
        }
        Update: {
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string | null
          severity?: string | null
          user_id?: string | null
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_violations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      initiatives: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          pic_id: string | null
          status: string
          target_result: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          target_result?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          target_result?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "initiatives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "initiatives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "initiatives_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_logs: {
        Row: {
          id: string
          ip: string | null
          logged_in_at: string
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          ip?: string | null
          logged_in_at?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          ip?: string | null
          logged_in_at?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          chat_message_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          mentioned_user_id: string
        }
        Insert: {
          chat_message_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          mentioned_user_id: string
        }
        Update: {
          chat_message_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentions_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          dedupe_date: string | null
          entity_id: string
          entity_type: string
          id: string
          is_read: boolean
          organization_id: string
          read_at: string | null
          recipient_id: string
          title: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          dedupe_date?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_read?: boolean
          organization_id: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          dedupe_date?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_read?: boolean
          organization_id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          position_title: string | null
          role_template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          organization_id?: string | null
          position_title?: string | null
          role_template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          position_title?: string | null
          role_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_template_id_fkey"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          action_plan_id: string
          created_at: string
          decision: string
          id: string
          reason: string | null
          reviewer_id: string | null
          submission_id: string
        }
        Insert: {
          action_plan_id: string
          created_at?: string
          decision: string
          id?: string
          reason?: string | null
          reviewer_id?: string | null
          submission_id: string
        }
        Update: {
          action_plan_id?: string
          created_at?: string
          decision?: string
          id?: string
          reason?: string | null
          reviewer_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_action_plan_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: false
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "action_plan_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_templates: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          level: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          level: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          level?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          organization_id: string | null
          updated_at: string
          value: Json | null
        }
        Insert: {
          id?: string
          key: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Update: {
          id?: string
          key?: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          permission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_action_plan: {
        Args: { p_action_plan_id: string }
        Returns: undefined
      }
      activate_initiative: {
        Args: { p_initiative_id: string }
        Returns: undefined
      }
      can_access_action_plan: {
        Args: { p_action_plan: string }
        Returns: boolean
      }
      can_access_initiative: {
        Args: { p_initiative: string }
        Returns: boolean
      }
      can_view_workspace: { Args: never; Returns: boolean }
      create_comment: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_mentions?: string[]
        }
        Returns: string
      }
      current_user_org: { Args: never; Returns: string }
      emit_deadline_notifications: { Args: never; Returns: number }
      emit_notification: {
        Args: {
          p_actor: string
          p_body: string
          p_dedupe_date?: string
          p_entity_id: string
          p_entity_type: string
          p_org: string
          p_recipient: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      generate_action_plan_instances: {
        Args: { p_action_plan_id: string; p_through_date: string }
        Returns: number
      }
      get_chat_rooms: {
        Args: never
        Returns: {
          id: string
          initiative_id: string
          last_message_at: string
          name: string
          unread_count: number
        }[]
      }
      get_near_deadline_items: {
        Args: never
        Returns: {
          action_plan_id: string
          due: string
          id: string
          kind: string
          name: string
          status: string
        }[]
      }
      get_org_today: { Args: never; Returns: string }
      get_overdue_items: {
        Args: never
        Returns: {
          action_plan_id: string
          due: string
          id: string
          kind: string
          name: string
          status: string
        }[]
      }
      get_repeat_compliance: {
        Args: { p_action_plan_id: string }
        Returns: {
          compliance: number
          done_count: number
          expected_count: number
          missed_count: number
          on_time_count: number
        }[]
      }
      get_today_repeat_instances: {
        Args: never
        Returns: {
          action_plan_id: string
          due: string
          id: string
          kind: string
          name: string
          status: string
        }[]
      }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      i_am_initiative_pic: { Args: { p_initiative: string }; Returns: boolean }
      initiative_has_my_action_plan: {
        Args: { p_initiative: string }
        Returns: boolean
      }
      is_chat_member: { Args: { p_room: string }; Returns: boolean }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_chat_messages_read: { Args: { p_room: string }; Returns: number }
      mark_notification_read: { Args: { p_id: string }; Returns: undefined }
      mark_overdue_instances: { Args: { p_now?: string }; Returns: number }
      org_today: { Args: { p_org?: string }; Returns: string }
      recompute_chat_room_members: {
        Args: { p_room: string }
        Returns: undefined
      }
      review_action_plan_instance_submission: {
        Args: { p_decision: string; p_reason: string; p_submission_id: string }
        Returns: undefined
      }
      review_action_plan_submission: {
        Args: { p_decision: string; p_reason: string; p_submission_id: string }
        Returns: undefined
      }
      send_chat_message: {
        Args: { p_body: string; p_mentions?: string[]; p_room: string }
        Returns: string
      }
      set_action_plan_repeat_rule: {
        Args: {
          p_action_plan_id: string
          p_custom_dates: string[]
          p_frequency: string
          p_grace_period_minutes: number
          p_missed_rule: string
          p_month_days: number[]
          p_repeat_end_date: string
          p_repeat_start_date: string
          p_time_of_day: string
          p_weekdays: number[]
        }
        Returns: string
      }
      start_action_plan: {
        Args: { p_action_plan_id: string }
        Returns: undefined
      }
      submit_action_plan: {
        Args: {
          p_action_plan_id: string
          p_evidence: Json
          p_note: string
          p_result_values: Json
        }
        Returns: string
      }
      submit_action_plan_instance: {
        Args: {
          p_evidence: Json
          p_instance_id: string
          p_note: string
          p_result_values: Json
        }
        Returns: string
      }
      user_role_level: { Args: never; Returns: string }
      write_activity: {
        Args: {
          p_action: string
          p_detail: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
      write_activity_system: {
        Args: {
          p_action: string
          p_actor: string
          p_detail: Json
          p_entity_id: string
          p_entity_type: string
          p_org: string
        }
        Returns: undefined
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
