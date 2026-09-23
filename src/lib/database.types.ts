export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type RoleSlug =
  | 'super_admin'
  | 'admin'
  | 'finance'
  | 'hr'
  | 'vice_director'
  | 'senior_sales_manager'
  | 'sales_manager'
  | 'ost';

export type EmploymentStatus = 'active' | 'inactive' | 'suspended' | 'resigned';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; employee_no: string | null; full_name: string; email: string; phone: string | null; department_id: string | null; role_id: string; employment_status: EmploymentStatus; genealogy_parent_id: string | null; vice_director_id: string | null; referral_depth: number; credit_eligibility: boolean; credit_count: number; manager_shoulders_payment: boolean; is_active: boolean; is_test_account: boolean; created_at: string; updated_at: string };
        Insert: { id: string; full_name: string; email: string; role_id: string; employee_no?: string | null; phone?: string | null; department_id?: string | null; employment_status?: string; genealogy_parent_id?: string | null; vice_director_id?: string | null; is_active?: boolean; is_test_account?: boolean };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      roles: {
        Row: { id: string; slug: RoleSlug; name: string; description: string | null; is_system: boolean; created_at: string };
        Insert: { slug: RoleSlug; name: string; description?: string | null; is_system?: boolean };
        Update: Partial<Database['public']['Tables']['roles']['Insert']>;
        Relationships: [];
      };
      departments: {
        Row: { id: string; name: string; description: string | null; accountable_leader_id: string | null; is_active: boolean; created_at: string; updated_at: string };
        Insert: { name: string; description?: string | null; accountable_leader_id?: string | null; is_active?: boolean };
        Update: { name?: string; description?: string | null; accountable_leader_id?: string | null; is_active?: boolean };
        Relationships: [];
      };
      staff_invitations: {
        Row: { id: string; user_id: string; email: string; status: 'pending' | 'accepted' | 'revoked'; invited_by: string; invited_at: string; last_sent_at: string; accepted_at: string | null; created_at: string; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      products: {
        Row: { id: string; category_id: string; name: string; description: string | null; price: string; status: string; down_payment_type: string; down_payment_value: string; image_path: string | null; created_at: string; updated_at: string };
        Insert: { category_id: string; name: string; price: string; description?: string | null; status?: string; down_payment_type?: string; down_payment_value?: string; image_path?: string | null };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
        Relationships: [];
      };
      customers: {
        Row: { id: string; customer_no: string; first_name: string; middle_name: string | null; last_name: string; email: string | null; phone: string; address: string; id_type: string; id_number_encrypted: string | null; created_by: string; assigned_salesperson_id: string | null; created_at: string; updated_at: string };
        Insert: { first_name: string; last_name: string; phone: string; address: string; id_type: string; middle_name?: string | null; email?: string | null; id_number_encrypted?: string | null; assigned_salesperson_id?: string | null };
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
        Relationships: [];
      };
      customer_documents: {
        Row: { id: string; customer_id: string; kind: string; storage_path: string; sha256: string; mime_type: string; size_bytes: number; uploaded_by: string; ocr_status: string; ocr_result: Json | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string };
        Insert: { customer_id: string; kind: string; storage_path: string; sha256: string; mime_type: string; size_bytes: number };
        Update: { ocr_status?: string; ocr_result?: Json | null; reviewed_by?: string | null; reviewed_at?: string | null };
        Relationships: [];
      };
      sales: {
        Row: { id: string; sale_no: string; customer_id: string; product_id: string; salesperson_id: string; vice_director_id: string | null; transaction_type: string; total_amount: string; status: string; payment_deadline: string | null; created_at: string; updated_at: string };
        Insert: { customer_id: string; product_id: string; salesperson_id: string; transaction_type: string; total_amount: string; vice_director_id?: string | null; payment_deadline?: string | null };
        Update: Partial<Database['public']['Tables']['sales']['Insert']>;
        Relationships: [];
      };
      payments: {
        Row: { id: string; sale_id: string; amount: string; method: string; reference_number: string | null; status: string; receipt_path: string | null; receipt_sha256: string | null; collected_by: string; verified_by: string | null; verified_at: string | null; verification_notes: string | null; created_at: string };
        Insert: { sale_id: string; amount: string; method: string; reference_number?: string | null; receipt_path?: string | null; receipt_sha256?: string | null };
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: { id: string; recipient_id: string; title: string; body: string; kind: string; read_at: string | null; created_at: string };
        Insert: { recipient_id: string; title: string; body: string; kind?: string };
        Update: { read_at?: string | null };
        Relationships: [];
      };
      audit_logs: {
        Row: { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; old_values: Json | null; new_values: Json | null; ip_address: string | null; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      qr_scan_events: {
        Row: {
          id: string;
          scanner_id: string;
          token_hash: string | null;
          invite_code_id: string | null;
          manager_id: string | null;
          referred_member_id: string | null;
          result: 'success' | 'invalid' | 'expired' | 'revoked' | 'duplicate' | 'unauthorized' | 'error';
          reason: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_permissions: { Args: never; Returns: string[] };
      verify_payment: { Args: { p_payment_id: string; p_approved: boolean; p_notes: string | null }; Returns: undefined };
      admin_create_department: { Args: { p_name: string; p_description: string | null; p_accountable_leader_id?: string | null }; Returns: Database['public']['Tables']['departments']['Row'] };
      admin_update_department: { Args: { p_department_id: string; p_name: string; p_description: string | null; p_is_active: boolean; p_accountable_leader_id?: string | null }; Returns: Database['public']['Tables']['departments']['Row'] };
      dashboard_metrics: { Args: never; Returns: Json };
      genealogy_tree: { Args: never; Returns: { id: string; full_name: string; role_name: string; role_slug: string; employment_status: string; is_active: boolean; is_test_account: boolean; depth: number; parent_id: string | null; vice_director_id: string | null; direct_referrals: number; total_descendants: number; sales_total: string }[] };
      record_auth_event: { Args: { p_event: 'login' | 'logout' }; Returns: undefined };
      record_export: { Args: { p_report: string; p_filters: Json; p_row_count: number }; Returns: undefined };
      scan_qr_code: { Args: { p_token: string; p_referred_member_id?: string | null }; Returns: Json };
      sales_analytics: {
        Args: {
          p_from: string;
          p_to: string;
          p_grouping?: string;
          p_product_type?: string;
          p_salesperson_id?: string | null;
          p_vice_director_id?: string | null;
        };
        Returns: Json;
      };
      vice_director_analytics: {
        Args: {
          p_from: string;
          p_to: string;
          p_grouping?: string;
          p_product_type?: string;
          p_vice_director_id?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
