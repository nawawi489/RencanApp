export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      action_plans: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          initiative_id: string | null
          name: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          pic_id: string | null
          problem_statement_id: string | null
          status: string
          target_result: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          initiative_id?: string | null
          name: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          problem_statement_id?: string | null
          status?: string
          target_result?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          initiative_id?: string | null
          name?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          problem_statement_id?: string | null
          status?: string
          target_result?: string | null
          team_id?: string | null
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
          {
            foreignKeyName: "initiatives_problem_statement_id_fkey"
            columns: ["problem_statement_id"]
            isOneToOne: false
            referencedRelation: "problem_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "initiatives_strategy_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "initiatives_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      brief_understanding_records: {
        Row: {
          id: string
          is_understood: boolean
          organization_id: string
          timestamp_seconds: number | null
          user_id: string
          video_brief_id: string
          watched_at: string
        }
        Insert: {
          id?: string
          is_understood?: boolean
          organization_id: string
          timestamp_seconds?: number | null
          user_id: string
          video_brief_id: string
          watched_at?: string
        }
        Update: {
          id?: string
          is_understood?: boolean
          organization_id?: string
          timestamp_seconds?: number | null
          user_id?: string
          video_brief_id?: string
          watched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_understanding_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_understanding_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_understanding_records_video_brief_id_fkey"
            columns: ["video_brief_id"]
            isOneToOne: false
            referencedRelation: "video_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellations: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          cancelled_by: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          reason: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          cancelled_by: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          reason: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          cancelled_by?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellations_organization_id_fkey"
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
      chat_message_reactions: {
        Row: {
          chat_message_id: string
          created_at: string
          emoji: string
          organization_id: string
          reactor_id: string
        }
        Insert: {
          chat_message_id: string
          created_at?: string
          emoji: string
          organization_id: string
          reactor_id: string
        }
        Update: {
          chat_message_id?: string
          created_at?: string
          emoji?: string
          organization_id?: string
          reactor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reactions_emoji_fkey"
            columns: ["emoji"]
            isOneToOne: false
            referencedRelation: "reaction_emojis"
            referencedColumns: ["emoji"]
          },
          {
            foreignKeyName: "chat_message_reactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          actor_id: string | null
          attachments: Json
          author_id: string | null
          body: string
          chat_room_id: string
          context_entity_id: string | null
          context_entity_type: string | null
          context_label: string | null
          created_at: string
          id: string
          kind: string
          organization_id: string
          reply_to_message_id: string | null
          system_event_type: string | null
        }
        Insert: {
          actor_id?: string | null
          attachments?: Json
          author_id?: string | null
          body: string
          chat_room_id: string
          context_entity_id?: string | null
          context_entity_type?: string | null
          context_label?: string | null
          created_at?: string
          id?: string
          kind?: string
          organization_id: string
          reply_to_message_id?: string | null
          system_event_type?: string | null
        }
        Update: {
          actor_id?: string | null
          attachments?: Json
          author_id?: string | null
          body?: string
          chat_room_id?: string
          context_entity_id?: string | null
          context_entity_type?: string | null
          context_label?: string | null
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
          reply_to_message_id?: string | null
          system_event_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
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
          action_plan_id: string
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          action_plan_id: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          action_plan_id?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_initiative_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: true
            referencedRelation: "action_plans"
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
      confidential_access_rules: {
        Row: {
          access_level: string
          approval_reason: string | null
          created_at: string
          entity_id: string
          entity_type: string
          granted_by: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          access_level?: string
          approval_reason?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          granted_by: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          access_level?: string
          approval_reason?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          granted_by?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "confidential_access_rules_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confidential_access_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confidential_access_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_change_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          organization_id: string
          request_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          request_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_change_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_change_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_change_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "deadline_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_change_requests: {
        Row: {
          approver_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          evidence_note: string | null
          id: string
          impact_if_rejected: string | null
          new_deadline: string
          old_deadline: string
          organization_id: string
          reason: string
          rejection_reason: string | null
          requestor_id: string
          responded_at: string | null
          revision_reason: string | null
          status: string
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          evidence_note?: string | null
          id?: string
          impact_if_rejected?: string | null
          new_deadline: string
          old_deadline: string
          organization_id: string
          reason: string
          rejection_reason?: string | null
          requestor_id: string
          responded_at?: string | null
          revision_reason?: string | null
          status?: string
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          evidence_note?: string | null
          id?: string
          impact_if_rejected?: string | null
          new_deadline?: string
          old_deadline?: string
          organization_id?: string
          reason?: string
          rejection_reason?: string | null
          requestor_id?: string
          responded_at?: string | null
          revision_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_change_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_change_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_change_requests_requestor_id_fkey"
            columns: ["requestor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      development_areas: {
        Row: {
          archived_at: string | null
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
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
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
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
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
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_areas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_areas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_areas_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          action_plan_id: string
          created_at: string
          evaluated_by: string
          failure_factors: string[] | null
          id: string
          lessons_learned: string | null
          organization_id: string
          pic_id: string | null
          results: string | null
          rollout_needed: boolean
          rollout_notes: string | null
          should_become_sop: boolean
          success_factors: string[] | null
          target_achieved: string | null
          updated_at: string
        }
        Insert: {
          action_plan_id: string
          created_at?: string
          evaluated_by: string
          failure_factors?: string[] | null
          id?: string
          lessons_learned?: string | null
          organization_id: string
          pic_id?: string | null
          results?: string | null
          rollout_needed?: boolean
          rollout_notes?: string | null
          should_become_sop?: boolean
          success_factors?: string[] | null
          target_achieved?: string | null
          updated_at?: string
        }
        Update: {
          action_plan_id?: string
          created_at?: string
          evaluated_by?: string
          failure_factors?: string[] | null
          id?: string
          lessons_learned?: string | null
          organization_id?: string
          pic_id?: string | null
          results?: string | null
          rollout_needed?: boolean
          rollout_notes?: string | null
          should_become_sop?: boolean
          success_factors?: string[] | null
          target_achieved?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_evaluated_by_fkey"
            columns: ["evaluated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_initiative_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: true
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "task_submissions"
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
      goal_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      goals: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          goal_template_id: string | null
          id: string
          name: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          pic_id: string | null
          status: string
          target_value: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          goal_template_id?: string | null
          id?: string
          name: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          target_value?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          goal_template_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          target_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_goal_template_id_fkey"
            columns: ["goal_template_id"]
            isOneToOne: false
            referencedRelation: "goal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_pic_id_fkey"
            columns: ["pic_id"]
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
          resolution_note: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
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
          resolution_note?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
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
          resolution_note?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
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
            foreignKeyName: "governance_violations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          alternative: string | null
          archived_at: string | null
          contribution_pct: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          main_risk: string | null
          name: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          pic_id: string | null
          reason: string | null
          status: string
          strategy_id: string
          updated_at: string
        }
        Insert: {
          alternative?: string | null
          archived_at?: string | null
          contribution_pct?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          main_risk?: string | null
          name: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          reason?: string | null
          status?: string
          strategy_id: string
          updated_at?: string
        }
        Update: {
          alternative?: string | null
          archived_at?: string | null
          contribution_pct?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          main_risk?: string | null
          name?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          reason?: string | null
          status?: string
          strategy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_kpi_area_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_pic_id_fkey"
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
      minimum_breakdown_rules: {
        Row: {
          child_card_type: string
          created_at: string
          enforcement_mode: string
          id: string
          min_count: number
          organization_id: string | null
          parent_card_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          child_card_type: string
          created_at?: string
          enforcement_mode?: string
          id?: string
          min_count?: number
          organization_id?: string | null
          parent_card_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          child_card_type?: string
          created_at?: string
          enforcement_mode?: string
          id?: string
          min_count?: number
          organization_id?: string | null
          parent_card_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "minimum_breakdown_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "minimum_breakdown_rules_updated_by_fkey"
            columns: ["updated_by"]
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
          resolution: string | null
          resolved_at: string | null
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
          resolution?: string | null
          resolved_at?: string | null
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
          resolution?: string | null
          resolved_at?: string | null
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
      period_snapshots: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          period_end: string
          period_name: string
          period_start: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          period_end: string
          period_name: string
          period_start: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          period_end?: string
          period_name?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_snapshots_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      positions: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_statements: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          development_area_id: string
          id: string
          impact: string | null
          initial_evidence: string | null
          name: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          pic_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          development_area_id: string
          id?: string
          impact?: string | null
          initial_evidence?: string | null
          name: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          development_area_id?: string
          id?: string
          impact?: string | null
          initial_evidence?: string | null
          name?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_statements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_statements_development_area_id_fkey"
            columns: ["development_area_id"]
            isOneToOne: false
            referencedRelation: "development_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_statements_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      push_deliveries: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          next_attempt_at: string
          notification_id: string
          provider_receipt_id: string | null
          provider_ticket_id: string | null
          push_token_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          next_attempt_at?: string
          notification_id: string
          provider_receipt_id?: string | null
          provider_ticket_id?: string | null
          push_token_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          next_attempt_at?: string
          notification_id?: string
          provider_receipt_id?: string | null
          provider_ticket_id?: string | null
          push_token_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_deliveries_push_token_id_fkey"
            columns: ["push_token_id"]
            isOneToOne: false
            referencedRelation: "push_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          expo_token: string
          id: string
          organization_id: string
          platform: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          expo_token: string
          id?: string
          organization_id: string
          platform: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          expo_token?: string
          id?: string
          organization_id?: string
          platform?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_snapshots: {
        Row: {
          created_at: string
          id: string
          metric_breakdown: Json
          organization_id: string
          period_snapshot_id: string
          rank_number: number
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric_breakdown?: Json
          organization_id: string
          period_snapshot_id: string
          rank_number: number
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metric_breakdown?: Json
          organization_id?: string
          period_snapshot_id?: string
          rank_number?: number
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_snapshots_period_snapshot_id_fkey"
            columns: ["period_snapshot_id"]
            isOneToOne: false
            referencedRelation: "period_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reaction_emojis: {
        Row: {
          active: boolean
          emoji: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          emoji: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          emoji?: string
          sort_order?: number
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          decision: string
          id: string
          reason: string | null
          reviewer_id: string | null
          submission_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          reason?: string | null
          reviewer_id?: string | null
          submission_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          reason?: string | null
          reviewer_id?: string | null
          submission_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_action_plan_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
            referencedRelation: "task_submissions"
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
      score_categories: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          id: string
          label: string
          level: string
          organization_id: string | null
          source_metric: string
        }
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          id?: string
          label: string
          level: string
          organization_id?: string | null
          source_metric: string
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          id?: string
          label?: string
          level?: string
          organization_id?: string | null
          source_metric?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      score_formula_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          end_date: string | null
          formula_version_id: string
          id: string
          organization_id: string
          role_level: string | null
          scope_level: string
          start_date: string
          user_id: string | null
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          end_date?: string | null
          formula_version_id: string
          id?: string
          organization_id: string
          role_level?: string | null
          scope_level: string
          start_date?: string
          user_id?: string | null
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          end_date?: string | null
          formula_version_id?: string
          id?: string
          organization_id?: string
          role_level?: string | null
          scope_level?: string
          start_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_formula_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_formula_assignments_formula_version_id_fkey"
            columns: ["formula_version_id"]
            isOneToOne: false
            referencedRelation: "score_formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_formula_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_formula_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      score_formula_templates: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          level: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          level: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          level?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_formula_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_formula_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      score_formula_versions: {
        Row: {
          activated_at: string | null
          approved_by: string | null
          categories: Json
          change_reason: string | null
          created_at: string
          created_by: string | null
          effective_date: string | null
          id: string
          level: string
          organization_id: string | null
          status: string
          template_id: string | null
          version_number: number
        }
        Insert: {
          activated_at?: string | null
          approved_by?: string | null
          categories?: Json
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          level: string
          organization_id?: string | null
          status?: string
          template_id?: string | null
          version_number: number
        }
        Update: {
          activated_at?: string | null
          approved_by?: string | null
          categories?: Json
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          level?: string
          organization_id?: string | null
          status?: string
          template_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_formula_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_formula_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_formula_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_formula_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "score_formula_templates"
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
      strategies: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expected_outcome: string | null
          goal_id: string
          id: string
          name: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          pic_id: string | null
          status: string
          target: string | null
          target_numeric: number | null
          target_unit: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_outcome?: string | null
          goal_id: string
          id?: string
          name: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          target?: string | null
          target_numeric?: number | null
          target_unit?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_outcome?: string | null
          goal_id?: string
          id?: string
          name?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          pic_id?: string | null
          status?: string
          target?: string | null
          target_numeric?: number | null
          target_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_areas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_areas_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_areas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_areas_pic_id_fkey"
            columns: ["pic_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_target_breakdowns: {
        Row: {
          contribution_pct: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          parent_quarter_key: string | null
          period_key: string
          period_type: string
          reason: string | null
          strategy_id: string
          updated_at: string
        }
        Insert: {
          contribution_pct: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          parent_quarter_key?: string | null
          period_key: string
          period_type: string
          reason?: string | null
          strategy_id: string
          updated_at?: string
        }
        Update: {
          contribution_pct?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          parent_quarter_key?: string | null
          period_key?: string
          period_type?: string
          reason?: string | null
          strategy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_area_target_breakdowns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_area_target_breakdowns_kpi_area_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_area_target_breakdowns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_templates: {
        Row: {
          created_at: string
          division: string
          division_label: string
          expected_outcome_hint: string | null
          goal_template_id: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          target_hint: string | null
        }
        Insert: {
          created_at?: string
          division: string
          division_label: string
          expected_outcome_hint?: string | null
          goal_template_id: string
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string
          sort_order?: number
          target_hint?: string | null
        }
        Update: {
          created_at?: string
          division?: string
          division_label?: string
          expected_outcome_hint?: string | null
          goal_template_id?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          target_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_area_templates_goal_template_id_fkey"
            columns: ["goal_template_id"]
            isOneToOne: false
            referencedRelation: "goal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_instances: {
        Row: {
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
          task_id: string
          updated_at: string
        }
        Insert: {
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
          task_id: string
          updated_at?: string
        }
        Update: {
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
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_instances_action_plan_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_instances_current_submission_fk"
            columns: ["current_submission_id"]
            isOneToOne: false
            referencedRelation: "task_submissions"
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
            referencedRelation: "task_repeat_rules"
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
      task_repeat_rules: {
        Row: {
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
          task_id: string
          time_of_day: string
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
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
          task_id: string
          time_of_day: string
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
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
          task_id?: string
          time_of_day?: string
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_repeat_rules_action_plan_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
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
      task_result_values: {
        Row: {
          created_at: string
          id: string
          label: string | null
          previous_value_text: string | null
          strategy_id: string | null
          submission_id: string
          value_numeric: number | null
          value_text: string | null
          value_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          previous_value_text?: string | null
          strategy_id?: string | null
          submission_id: string
          value_numeric?: number | null
          value_text?: string | null
          value_type: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          previous_value_text?: string | null
          strategy_id?: string | null
          submission_id?: string
          value_numeric?: number | null
          value_text?: string | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_result_values_kpi_area_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plan_result_values_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "task_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_submissions: {
        Row: {
          created_at: string
          id: string
          note: string | null
          review_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          task_id: string
          task_instance_id: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          task_id: string
          task_instance_id?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          task_id?: string
          task_instance_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_submissions_action_plan_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
          {
            foreignKeyName: "task_submissions_task_instance_id_fkey"
            columns: ["task_instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          action_plan_id: string
          archived_at: string | null
          created_at: string
          created_by: string | null
          current_submission_id: string | null
          deadline: string | null
          deadline_time: string | null
          definition_of_done: string | null
          description: string | null
          evidence_description: string | null
          evidence_required: boolean
          expected_output: string | null
          id: string
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
          action_plan_id: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          current_submission_id?: string | null
          deadline?: string | null
          deadline_time?: string | null
          definition_of_done?: string | null
          description?: string | null
          evidence_description?: string | null
          evidence_required?: boolean
          expected_output?: string | null
          id?: string
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
          action_plan_id?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          current_submission_id?: string | null
          deadline?: string | null
          deadline_time?: string | null
          definition_of_done?: string | null
          description?: string | null
          evidence_description?: string | null
          evidence_required?: boolean
          expected_output?: string | null
          id?: string
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
            referencedRelation: "task_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_initiative_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: false
            referencedRelation: "action_plans"
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
      team_members: {
        Row: {
          id: string
          joined_at: string
          organization_id: string
          profile_id: string
          role_in_team: string | null
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          organization_id: string
          profile_id: string
          role_in_team?: string | null
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          organization_id?: string
          profile_id?: string
          role_in_team?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          lead_id: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lead_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lead_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
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
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id: string
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id?: string
          scope?: string
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
      user_score_results: {
        Row: {
          auto_calculated_score: number
          calculated_at: string
          id: string
          is_current: boolean
          manual_adjusted_score: number | null
          metric_breakdown: Json
          organization_id: string
          override_approved_by: string | null
          override_changed_at: string | null
          override_changed_by: string | null
          override_reason: string | null
          period_snapshot_id: string
          result_kind: string
          score_formula_version_id: string | null
          user_id: string
        }
        Insert: {
          auto_calculated_score: number
          calculated_at?: string
          id?: string
          is_current?: boolean
          manual_adjusted_score?: number | null
          metric_breakdown?: Json
          organization_id: string
          override_approved_by?: string | null
          override_changed_at?: string | null
          override_changed_by?: string | null
          override_reason?: string | null
          period_snapshot_id: string
          result_kind?: string
          score_formula_version_id?: string | null
          user_id: string
        }
        Update: {
          auto_calculated_score?: number
          calculated_at?: string
          id?: string
          is_current?: boolean
          manual_adjusted_score?: number | null
          metric_breakdown?: Json
          organization_id?: string
          override_approved_by?: string | null
          override_changed_at?: string | null
          override_changed_by?: string | null
          override_reason?: string | null
          period_snapshot_id?: string
          result_kind?: string
          score_formula_version_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_score_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_score_results_override_approved_by_fkey"
            columns: ["override_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_score_results_override_changed_by_fkey"
            columns: ["override_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_score_results_period_snapshot_id_fkey"
            columns: ["period_snapshot_id"]
            isOneToOne: false
            referencedRelation: "period_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_score_results_score_formula_version_id_fkey"
            columns: ["score_formula_version_id"]
            isOneToOne: false
            referencedRelation: "score_formula_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_score_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_briefs: {
        Row: {
          action_plan_id: string
          brief_url: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          organization_id: string
        }
        Insert: {
          action_plan_id: string
          brief_url: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          organization_id: string
        }
        Update: {
          action_plan_id?: string
          brief_url?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_briefs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_briefs_initiative_id_fkey"
            columns: ["action_plan_id"]
            isOneToOne: true
            referencedRelation: "action_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_briefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      strategy_current_values: {
        Row: {
          last_approved_at: string | null
          numeric_total: number | null
          strategy_id: string | null
          text_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plan_result_values_kpi_area_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _valid_chat_attachments: { Args: { p_att: Json }; Returns: boolean }
      action_plan_has_my_task: {
        Args: { p_action_plan: string }
        Returns: boolean
      }
      activate_action_plan: {
        Args: { p_action_plan_id: string }
        Returns: undefined
      }
      activate_development_area: {
        Args: { p_development_area_id: string }
        Returns: undefined
      }
      activate_goal: { Args: { p_goal_id: string }; Returns: undefined }
      activate_initiative: {
        Args: { p_initiative_id: string }
        Returns: undefined
      }
      activate_problem_statement: {
        Args: { p_problem_statement_id: string }
        Returns: undefined
      }
      activate_score_formula_version: {
        Args: { p_effective_date: string; p_version_id: string }
        Returns: undefined
      }
      activate_strategy: { Args: { p_strategy_id: string }; Returns: undefined }
      activate_task: { Args: { p_action_plan_id: string }; Returns: undefined }
      aggregate_repeat_metrics_per_user: {
        Args: { p_end: string; p_org: string; p_start: string; p_user: string }
        Returns: {
          on_time_rate: number
          repeat_compliance: number
        }[]
      }
      apply_goal_template: {
        Args: {
          p_goal_template_id: string
          p_period_end: string
          p_period_start: string
          p_pic_id: string
          p_targets?: Json
        }
        Returns: string
      }
      approve_cancellation: {
        Args: { p_cancellation_id: string }
        Returns: undefined
      }
      archive_card: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: undefined
      }
      assign_score_formula: {
        Args: {
          p_role_level: string
          p_scope_level: string
          p_start_date: string
          p_user_id: string
          p_version_id: string
        }
        Returns: string
      }
      assign_team_member: {
        Args: {
          p_profile_id: string
          p_role_in_team: string
          p_team_id: string
        }
        Returns: string
      }
      backfill_resolve_stale_notifications: { Args: never; Returns: undefined }
      bump_push_delivery_backoff: {
        Args: { p_error?: string; p_id: string }
        Returns: undefined
      }
      calculate_period_scores: {
        Args: { p_period_id: string }
        Returns: number
      }
      can_access_action_plan: {
        Args: { p_action_plan: string }
        Returns: boolean
      }
      can_access_confidential_chat: {
        Args: { p_ap_id: string }
        Returns: boolean
      }
      can_access_development_area: {
        Args: { p_dev_area: string }
        Returns: boolean
      }
      can_access_goal: { Args: { p_goal: string }; Returns: boolean }
      can_access_initiative: {
        Args: { p_initiative: string }
        Returns: boolean
      }
      can_access_problem_statement: { Args: { p_ps: string }; Returns: boolean }
      can_access_strategy: { Args: { p_strategy: string }; Returns: boolean }
      can_access_task: { Args: { p_task: string }; Returns: boolean }
      can_edit_strategy_breakdown: {
        Args: { p_strategy_id: string }
        Returns: boolean
      }
      can_read_chat_attachment: { Args: { p_room: string }; Returns: boolean }
      can_view_workspace: { Args: never; Returns: boolean }
      can_write_chat_attachment: { Args: { p_room: string }; Returns: boolean }
      cancel_card: {
        Args: { p_entity_id: string; p_entity_type: string; p_reason: string }
        Returns: string
      }
      card_completion_rule_for: {
        Args: { p_card_type: string; p_org: string }
        Returns: string[]
      }
      check_minimum_breakdown_compliance: {
        Args: { p_parent_card_id: string; p_parent_card_type: string }
        Returns: {
          child_card_type: string
          current_count: number
          enforcement_mode: string
          meets_requirement: boolean
          required_count: number
        }[]
      }
      claim_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          body: string
          delivery_id: string
          entity_id: string
          entity_type: string
          expo_token: string
          notification_id: string
          platform: string
          push_token_id: string
          title: string
          type: string
        }[]
      }
      cleanup_orphan_chat_upload: {
        Args: { p_path: string }
        Returns: undefined
      }
      cleanup_orphan_upload: { Args: { p_path: string }; Returns: undefined }
      close_period_snapshot: { Args: { p_period_id: string }; Returns: number }
      compute_action_plan_completion: {
        Args: { p_end: string; p_org: string; p_start: string; p_user: string }
        Returns: number
      }
      compute_development_contribution: {
        Args: { p_end: string; p_org: string; p_start: string; p_user: string }
        Returns: number
      }
      compute_governance_discipline: {
        Args: { p_end: string; p_org: string; p_start: string; p_user: string }
        Returns: number
      }
      compute_review_pass_rate: {
        Args: { p_end: string; p_org: string; p_start: string; p_user: string }
        Returns: number
      }
      create_comment: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_mentions?: string[]
        }
        Returns: string
      }
      create_deadline_change_request: {
        Args: {
          p_entity_id: string
          p_evidence_note: string
          p_impact: string
          p_new_deadline: string
          p_old_deadline: string
          p_reason: string
        }
        Returns: string
      }
      create_department: {
        Args: { p_description: string; p_name: string }
        Returns: string
      }
      create_position: {
        Args: {
          p_department_id?: string
          p_description?: string
          p_name: string
        }
        Returns: string
      }
      create_role_template: {
        Args: { p_level: string; p_name: string }
        Returns: string
      }
      create_score_formula_draft: {
        Args: {
          p_categories?: Json
          p_change_reason: string
          p_level: string
          p_template_id: string
        }
        Returns: string
      }
      create_submission_draft: {
        Args: { p_action_plan_id: string; p_attachment_count: number }
        Returns: string
      }
      create_team: {
        Args: {
          p_department_id: string
          p_description: string
          p_lead_id: string
          p_name: string
        }
        Returns: string
      }
      current_minimum_breakdown_rule: {
        Args: { p_child_card_type: string; p_parent_card_type: string }
        Returns: {
          child_card_type: string
          created_at: string
          enforcement_mode: string
          id: string
          min_count: number
          organization_id: string | null
          parent_card_type: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "minimum_breakdown_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_org: { Args: never; Returns: string }
      development_area_has_my_descendant: {
        Args: { p_dev_area: string }
        Returns: boolean
      }
      development_area_in_my_org: {
        Args: { p_dev_area: string }
        Returns: boolean
      }
      emit_chat_system_event: {
        Args: { p_actor: string; p_event_type: string; p_task: string }
        Returns: undefined
      }
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
      emit_period_closing_reminders: { Args: never; Returns: number }
      enforce_card_completion_rule: {
        Args: { p_card_type: string; p_required: string[]; p_row: Json }
        Returns: undefined
      }
      generate_action_plan_instances: {
        Args: { p_action_plan_id: string; p_through_date: string }
        Returns: number
      }
      get_chat_rooms: {
        Args: never
        Returns: {
          action_plan_id: string
          id: string
          last_message_at: string
          last_message_author_name: string
          last_message_body: string
          name: string
          unread_count: number
        }[]
      }
      get_near_deadline_items: {
        Args: never
        Returns: {
          due: string
          id: string
          kind: string
          name: string
          status: string
          task_id: string
        }[]
      }
      get_org_today: { Args: never; Returns: string }
      get_overdue_items: {
        Args: never
        Returns: {
          due: string
          id: string
          kind: string
          name: string
          status: string
          task_id: string
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
          due: string
          id: string
          kind: string
          name: string
          status: string
          task_id: string
        }[]
      }
      goal_has_my_descendant: { Args: { p_goal: string }; Returns: boolean }
      goal_in_my_org: { Args: { p_goal: string }; Returns: boolean }
      grant_confidential_access: {
        Args: {
          p_access_level: string
          p_entity_id: string
          p_entity_type: string
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      i_am_action_plan_pic: {
        Args: { p_action_plan: string }
        Returns: boolean
      }
      i_am_problem_statement_pic_via_action_plan: {
        Args: { p_action_plan: string }
        Returns: boolean
      }
      initiative_has_my_descendant: {
        Args: { p_initiative: string }
        Returns: boolean
      }
      initiative_in_my_org: { Args: { p_initiative: string }; Returns: boolean }
      is_chat_member: { Args: { p_room: string }; Returns: boolean }
      is_development_area_pic: {
        Args: { p_dev_area: string }
        Returns: boolean
      }
      is_goal_pic: { Args: { p_goal: string }; Returns: boolean }
      is_problem_statement_pic: { Args: { p_ps: string }; Returns: boolean }
      is_push_worthy: {
        Args: { p_org?: string; p_type: string }
        Returns: boolean
      }
      is_strategy_pic: { Args: { p_strategy: string }; Returns: boolean }
      is_supervisor_of: { Args: { p_user: string }; Returns: boolean }
      list_strategy_candidates_for_task: {
        Args: { p_action_plan_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      list_user_permissions_admin: {
        Args: { p_target_user_id: string }
        Returns: Json[]
      }
      log_governance_violation: {
        Args: {
          p_detail?: Json
          p_entity_id: string
          p_entity_type: string
          p_severity?: string
          p_user_id: string
          p_violation_type: string
        }
        Returns: undefined
      }
      map_legacy_entity_type: {
        Args: { p_entity_type: string }
        Returns: string
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_chat_messages_read: { Args: { p_room: string }; Returns: number }
      mark_notification_read: { Args: { p_id: string }; Returns: undefined }
      mark_overdue_instances: { Args: { p_now?: string }; Returns: number }
      open_period_snapshot: {
        Args: {
          p_period_end: string
          p_period_name: string
          p_period_start: string
        }
        Returns: string
      }
      org_today: { Args: { p_org?: string }; Returns: string }
      override_user_score: {
        Args: {
          p_manual_score: number
          p_period_id: string
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      problem_statement_has_my_descendant: {
        Args: { p_ps: string }
        Returns: boolean
      }
      problem_statement_in_my_org: { Args: { p_ps: string }; Returns: boolean }
      purge_old_activity_logs: {
        Args: {
          p_activate_after?: string
          p_batch_size?: number
          p_retention_months?: number
        }
        Returns: number
      }
      recompute_chat_room_members: {
        Args: { p_room: string }
        Returns: undefined
      }
      record_evaluation: {
        Args: {
          p_action_plan_id: string
          p_failure_factors: string[]
          p_lessons_learned: string
          p_results: string
          p_rollout_needed: boolean
          p_rollout_notes: string
          p_should_become_sop: boolean
          p_success_factors: string[]
          p_target_achieved: string
        }
        Returns: string
      }
      register_push_token: {
        Args: { p_device_id?: string; p_expo_token: string; p_platform: string }
        Returns: undefined
      }
      remove_team_member: {
        Args: { p_profile_id: string; p_team_id: string }
        Returns: undefined
      }
      resolve_governance_violation: {
        Args: {
          p_resolution_note: string
          p_status?: string
          p_violation_id: string
        }
        Returns: undefined
      }
      resolve_notifications: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_resolution: string
          p_types: string[]
        }
        Returns: number
      }
      restore_card: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: undefined
      }
      restore_goal_template_items: {
        Args: { p_goal_id: string }
        Returns: number
      }
      resubmit_deadline_change_request: {
        Args: { p_new_deadline: string; p_reason: string; p_request_id: string }
        Returns: undefined
      }
      review_deadline_change: {
        Args: { p_decision: string; p_reason: string; p_request_id: string }
        Returns: undefined
      }
      review_task_instance_submission: {
        Args: { p_decision: string; p_reason: string; p_submission_id: string }
        Returns: undefined
      }
      review_task_submission: {
        Args: { p_decision: string; p_reason: string; p_submission_id: string }
        Returns: undefined
      }
      search_cards: {
        Args: {
          p_entity_types: string[]
          p_include_archived: boolean
          p_query: string
        }
        Returns: Json[]
      }
      search_chat_messages: {
        Args: {
          p_before?: string
          p_before_id?: string
          p_limit?: number
          p_query: string
          p_room_id?: string
        }
        Returns: {
          author_id: string
          author_name: string
          body_similarity: number
          chat_room_id: string
          created_at: string
          initiative_id: string
          message_id: string
          room_name: string
          snippet: string
        }[]
      }
      search_global: {
        Args: {
          p_cursor_id?: string
          p_cursor_ts?: string
          p_include_archived?: boolean
          p_limit?: number
          p_query: string
          p_scopes?: string[]
        }
        Returns: {
          id: string
          parent_id: string
          scope: string
          snippet: string
          sort_id: string
          sort_ts: string
          status: string
          subtitle: string
          title: string
        }[]
      }
      send_chat_message: {
        Args: {
          p_attachments?: Json
          p_body: string
          p_context_action_plan?: string
          p_mentions?: string[]
          p_reply_to?: string
          p_room: string
        }
        Returns: string
      }
      set_department_active: {
        Args: { p_active: boolean; p_department_id: string }
        Returns: undefined
      }
      set_minimum_breakdown_rule: {
        Args: {
          p_child_card_type: string
          p_enforcement_mode: string
          p_min_count: number
          p_parent_card_type: string
        }
        Returns: string
      }
      set_task_repeat_rule: {
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
      set_user_permission: {
        Args: {
          p_granted: boolean
          p_permission_key: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      set_user_permission_scope: {
        Args: {
          p_permission_key: string
          p_scope: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      start_task: { Args: { p_action_plan_id: string }; Returns: undefined }
      strategy_breakdown_replace: {
        Args: {
          p_month: Json
          p_quarter: Json
          p_reason: string
          p_strategy_id: string
        }
        Returns: {
          contribution_pct: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          parent_quarter_key: string | null
          period_key: string
          period_type: string
          reason: string | null
          strategy_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "strategy_target_breakdowns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      strategy_has_my_descendant: {
        Args: { p_strategy: string }
        Returns: boolean
      }
      strategy_in_my_org: { Args: { p_strategy: string }; Returns: boolean }
      submit_task: {
        Args: {
          p_evidence: Json
          p_note: string
          p_result_values: Json
          p_submission_draft_id: string
        }
        Returns: string
      }
      submit_task_instance: {
        Args: {
          p_evidence: Json
          p_instance_id: string
          p_note: string
          p_result_values: Json
        }
        Returns: string
      }
      toggle_chat_reaction: {
        Args: { p_emoji: string; p_message: string }
        Returns: boolean
      }
      unregister_push_token: {
        Args: { p_expo_token: string }
        Returns: undefined
      }
      update_score_formula_version_weights: {
        Args: {
          p_categories: Json
          p_change_reason: string
          p_version_id: string
        }
        Returns: undefined
      }
      upsert_card_completion_rule: {
        Args: {
          p_card_type: string
          p_reason?: string
          p_required_fields: string[]
        }
        Returns: undefined
      }
      upsert_card_guidance: {
        Args: {
          p_body: string
          p_card_type: string
          p_reason?: string
          p_title: string
        }
        Returns: undefined
      }
      upsert_score_formula_version: {
        Args: {
          p_categories: Json
          p_change_reason: string
          p_template_id: string
        }
        Returns: string
      }
      upsert_settings: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      user_role_level: { Args: never; Returns: string }
      workspace_card_progress: {
        Args: { p_card_ids: string[] }
        Returns: {
          card_id: string
          is_measured: boolean
          progress: number
        }[]
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

