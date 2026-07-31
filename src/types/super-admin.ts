// ============================================================
// Super Admin TypeScript interfaces.
//
// Covers all data structures used by the super admin panel:
// - Platform metrics (fn_platform_metrics RPC)
// - Account summaries (v_platform_accounts_summary view)
// - Account deep dive (fn_account_deep_dive RPC)
// - Signup growth data (fn_signups_over_time RPC)
// - CMS content types (site_settings, landing_sections, etc.)
// ============================================================

import type { MemberPermissions, WhatsAppConfig } from '@/types';

// ============================================================
// Analytics
// ============================================================

export interface PlatformMetrics {
  total_accounts: number;
  total_users: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  messages_today: number;
  messages_7d: number;
  new_accounts_today: number;
  new_accounts_7d: number;
  new_accounts_30d: number;
  banned_accounts: number;
  total_contacts: number;
  total_broadcasts: number;
  total_automations: number;
  total_deals_value: number;
  connected_whatsapp: number;
  disconnected_whatsapp: number;
}

export interface AccountSummary {
  account_id: string;
  account_name: string;
  is_banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  account_created_at: string;
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
  owner_avatar_url: string | null;
  member_count: number;
  contact_count: number;
  conversation_count: number;
  messages_30d: number;
  whatsapp_status: 'connected' | 'disconnected' | null;
  last_activity_at: string | null;
}

export interface AccountFilters {
  status?: 'all' | 'active' | 'inactive' | 'banned';
  whatsapp?: 'all' | 'connected' | 'disconnected';
  search?: string;
  sortBy?: 'newest' | 'oldest' | 'most_active' | 'most_members';
}

export interface AccountMemberDetail {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  account_role: 'owner' | 'member';
  permissions: MemberPermissions | null;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
  is_online: boolean;
}

export interface AccountDeepDive {
  account: {
    id: string;
    name: string;
    is_banned: boolean;
    banned_at: string | null;
    banned_reason: string | null;
    created_at: string;
    updated_at: string;
  };
  members: AccountMemberDetail[];
  stats: {
    contact_count: number;
    conversation_count: number;
    active_conversations: number;
    messages_total: number;
    messages_30d: number;
    active_automations: number;
    total_automations: number;
    broadcasts_sent: number;
    deals_open_value: number;
    deals_open_count: number;
  };
  whatsapp_config: WhatsAppConfig | null;
}

export interface SignupDataPoint {
  date: string;
  new_accounts: number;
  new_users: number;
}

// ============================================================
// Health Dashboard
// ============================================================

export interface HealthMetrics {
  total_messages: number;
  messages_today: number;
  messages_7d: number;
  total_contacts: number;
  total_conversations: number;
  total_accounts: number;
  active_accounts: number;
  banned_accounts: number;
  total_ai_tokens: number;
  ai_requests_today: number;
  total_automation_runs: number;
  automation_runs_today: number;
  total_broadcasts: number;
  total_users: number;
  connected_whatsapp: number;
}

export interface MessageVolumePoint {
  date: string;
  count: number;
}

export interface ActivityLogEntry {
  type: 'account_created' | 'broadcast_sent' | 'automation_triggered' | 'message_sent';
  description: string;
  account_name: string;
  timestamp: string;
}

export interface TableStat {
  table_name: string;
  row_count: number;
}

export interface HealthDashboardData {
  metrics: HealthMetrics;
  message_volume: MessageVolumePoint[];
  activity_feed: ActivityLogEntry[];
  table_stats: TableStat[];
}

// ============================================================
// CMS Content Types
// ============================================================

export interface NavLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export interface SiteSettings {
  id: string;
  site_name: string;
  tagline: string;
  site_description: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  canonical_url: string | null;
  social_twitter: string | null;
  social_linkedin: string | null;
  social_github: string | null;
  social_instagram: string | null;
  social_youtube: string | null;
  support_email: string | null;
  sales_email: string | null;
  privacy_email: string | null;
  legal_email: string | null;
  copyright_text: string | null;
  show_social_icons: boolean;
  show_newsletter: boolean;
  no_index: boolean;
  json_ld_schema: string | null;
  header_links: NavLink[];
  footer_links: FooterColumn[];
  created_at: string;
  updated_at: string;
}

export interface LandingSection {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  body_text: string | null;
  cta_primary_text: string | null;
  cta_primary_link: string | null;
  cta_secondary_text: string | null;
  cta_secondary_link: string | null;
  background_style: string | null;
  background_image_url: string | null;
  image_url: string | null;
  images: string[];
  images_secondary: string[];
  is_visible: boolean;
  position: number;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LandingFeature {
  id: string;
  icon_name: string;
  title: string;
  description: string;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LandingTestimonial {
  id: string;
  quote: string;
  author_name: string;
  author_role: string | null;
  author_company: string | null;
  author_avatar_url: string | null;
  rating: number;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LandingPricingTier {
  id: string;
  name: string;
  price_monthly: string | null;
  price_yearly: string | null;
  price_subtitle: string | null;
  features: string[];
  is_highlighted: boolean;
  highlight_label: string | null;
  cta_text: string | null;
  cta_link: string | null;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LandingIntegration {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LegalPage {
  id: string;
  slug: string;
  title: string;
  content_markdown: string;
  is_published: boolean;
  last_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface LandingImage {
  id: string;
  image_key: string;
  url: string;
  alt_text: string;
  created_at: string;
  updated_at: string;
}

export interface LandingFaq {
  id: string;
  question: string;
  answer: string;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}
