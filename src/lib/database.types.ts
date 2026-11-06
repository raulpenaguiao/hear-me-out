
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "channels": {
                  Row: {
                    "author_name": string | null,"category": string,"cover_image_key": string | null,"cover_image_mime_type": string | null,"created_at": string,"description": string,"explicit": boolean,"id": string,"language": string,"owner_id": string,"published": boolean,"rss_token_ciphertext": string,"rss_token_hash": string,"title": string,"tokens_rotated_at": string,"updated_at": string,"web_token_ciphertext": string,"web_token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_name"?: string | null,"category"?: string,"cover_image_key"?: string | null,"cover_image_mime_type"?: string | null,"created_at"?: string,"description"?: string,"explicit"?: boolean,"id"?: string,"language"?: string,"owner_id": string,"published"?: boolean,"rss_token_ciphertext": string,"rss_token_hash": string,"title": string,"tokens_rotated_at"?: string,"updated_at"?: string,"web_token_ciphertext": string,"web_token_hash": string
                  }
                  Update: {
                    "author_name"?: string | null,"category"?: string,"cover_image_key"?: string | null,"cover_image_mime_type"?: string | null,"created_at"?: string,"description"?: string,"explicit"?: boolean,"id"?: string,"language"?: string,"owner_id"?: string,"published"?: boolean,"rss_token_ciphertext"?: string,"rss_token_hash"?: string,"title"?: string,"tokens_rotated_at"?: string,"updated_at"?: string,"web_token_ciphertext"?: string,"web_token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channels_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"episodes": {
                  Row: {
                    "audio_mime_type": string | null,"audio_size_bytes": number | null,"audio_storage_key": string | null,"channel_id": string,"created_at": string,"description": string,"duration_seconds": number | null,"guid": string,"id": string,"published_at": string | null,"status": Database["public"]['Enums']["episode_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audio_mime_type"?: string | null,"audio_size_bytes"?: number | null,"audio_storage_key"?: string | null,"channel_id": string,"created_at"?: string,"description"?: string,"duration_seconds"?: number | null,"guid"?: string,"id"?: string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["episode_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "audio_mime_type"?: string | null,"audio_size_bytes"?: number | null,"audio_storage_key"?: string | null,"channel_id"?: string,"created_at"?: string,"description"?: string,"duration_seconds"?: number | null,"guid"?: string,"id"?: string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["episode_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "episodes_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "channels"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"email": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"email": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"email"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "bucket_key": string,"hits": number,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_key": string,"hits"?: number,"window_start": string
                  }
                  Update: {
                    "bucket_key"?: string,"hits"?: number,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"uploads": {
                  Row: {
                    "channel_id": string,"completed_at": string | null,"created_at": string,"declared_mime_type": string,"declared_size_bytes": number,"episode_id": string | null,"expires_at": string,"id": string,"kind": Database["public"]['Enums']["upload_kind"],"owner_id": string,"storage_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_id": string,"completed_at"?: string | null,"created_at"?: string,"declared_mime_type": string,"declared_size_bytes": number,"episode_id"?: string | null,"expires_at": string,"id"?: string,"kind": Database["public"]['Enums']["upload_kind"],"owner_id": string,"storage_key": string
                  }
                  Update: {
                    "channel_id"?: string,"completed_at"?: string | null,"created_at"?: string,"declared_mime_type"?: string,"declared_size_bytes"?: number,"episode_id"?: string | null,"expires_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["upload_kind"],"owner_id"?: string,"storage_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "uploads_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "uploads_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "uploads_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "complete_upload":
{ Args: { "p_duration_seconds": number,"p_final_key": string,"p_mime_type": string,"p_owner_id": string,"p_size_bytes": number,"p_upload_id": string }; Returns: string
                           },
"owns_channel":
{ Args: { "p_channel_id": string }; Returns: boolean
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max_hits": number,"p_window_seconds": number }; Returns: boolean
                           }
          }
          Enums: {
            "episode_status": "draft"|"published","upload_kind": "audio"|"cover"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "episode_status": ["draft", "published"],"upload_kind": ["audio", "cover"]
          }
        }
} as const
