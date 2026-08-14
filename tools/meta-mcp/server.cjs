#!/usr/bin/env node

/**
 * Meta Graph API MCP Server — Replai edition
 * ==========================================
 *
 * A stdio MCP server exposing Meta's Graph API to AI agents working on the
 * Replai WhatsApp CRM.
 *
 * WHY THIS FILE WAS REWRITTEN
 * ---------------------------
 * The previous version authenticated every call with a single USER access
 * token. That silently broke every app-level endpoint, because Meta requires
 * an *app* access token (or an appsecret proof) for those:
 *
 *   GET /{app-id}/roles         -> "(#15) must be called with an app access_token"
 *   GET /{app-id}/subscriptions -> "(#190) Application Secret required"
 *
 * Those two are exactly the endpoints you need to debug onboarding and
 * webhook problems, so the server was blind precisely where it mattered.
 *
 * This version keeps BOTH credentials and picks the right one per endpoint.
 *
 * SECURITY CHANGES
 * ----------------
 * 1. Tokens now travel in the `Authorization` header, not the query string.
 *    Query strings end up in proxy logs and crash reports; headers do not.
 * 2. `appsecret_proof` is attached when the App Secret is available. Meta
 *    recommends it and some app configurations require it.
 * 3. Error responses are surfaced with code + subcode + fbtrace_id, because
 *    Meta reuses the same human-readable message for unrelated causes and
 *    the numeric subcode is the only reliable discriminator.
 * 4. Nothing logs a token or a full response body.
 *
 * See AGENTS.md in this folder for the agent-facing usage guide.
 */

const crypto = require("crypto");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// ── Credentials ────────────────────────────────────────────────
const USER_TOKEN = process.env.META_ACCESS_TOKEN;
const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;

// Default aligned with src/lib/whatsapp/graph-version.ts. Keeping the MCP
// server on a different version than the app is how you get a payload that
// works in one place and is rejected in the other.
const API_VERSION = process.env.META_API_VERSION || "v23.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

if (!USER_TOKEN) {
  console.error(
    "ERROR: META_ACCESS_TOKEN is required.\n" +
      "Set it in your MCP config. See AGENTS.md for which token to use."
  );
  process.exit(1);
}

/**
 * App access token. Meta's documented form is literally `{app-id}|{app-secret}`.
 * Null when either half is missing, which lets app-level tools fail with an
 * instruction instead of a cryptic Meta error.
 */
const APP_TOKEN = APP_ID && APP_SECRET ? `${APP_ID}|${APP_SECRET}` : null;

function appsecretProof(token) {
  if (!APP_SECRET) return null;
  return crypto.createHmac("sha256", APP_SECRET).update(token).digest("hex");
}

const MISSING_APP_CREDS =
  "This endpoint needs an APP access token, which requires both META_APP_ID " +
  "and META_APP_SECRET in the MCP server env. Only META_ACCESS_TOKEN is set. " +
  "Add the App Secret from App Dashboard > App settings > Basic > App secret.";

// ── Core request helper ────────────────────────────────────────
/**
 * @param endpoint  Path beginning with '/'. May already contain a query string.
 * @param opts.method  GET | POST | DELETE
 * @param opts.body    Object sent as JSON for non-GET
 * @param opts.auth    'user' (default) or 'app'
 */
async function graphApi(endpoint, opts = {}) {
  const { method = "GET", body = null, auth = "user" } = opts;

  let token;
  if (auth === "app") {
    if (!APP_TOKEN) throw new Error(MISSING_APP_CREDS);
    token = APP_TOKEN;
  } else {
    token = USER_TOKEN;
  }

  // An app token is `id|secret`; hashing it with the secret is meaningless
  // and Meta rejects the combination. Proof applies to user tokens only.
  const proof = auth === "user" ? appsecretProof(token) : null;

  let url = `${BASE_URL}${endpoint}`;
  if (proof) {
    url += (url.includes("?") ? "&" : "?") + `appsecret_proof=${proof}`;
  }

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Meta returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (data.error) {
    const e = data.error;
    const parts = [`Graph API Error: ${e.message}`];
    if (e.code !== undefined) parts.push(`code=${e.code}`);
    if (e.error_subcode !== undefined) parts.push(`subcode=${e.error_subcode}`);
    if (e.type) parts.push(`type=${e.type}`);
    if (e.fbtrace_id) parts.push(`fbtrace_id=${e.fbtrace_id}`);

    let hint = "";
    // Meta's own messages for these are famously unhelpful, so translate the
    // ones this project keeps tripping over into next actions.
    if (e.code === 15 || e.code === 190) {
      hint = APP_TOKEN
        ? " HINT: retried with app auth? Some app endpoints also require you to be a listed app Admin."
        : ` HINT: ${MISSING_APP_CREDS}`;
    } else if (e.code === 200) {
      hint =
        " HINT: code 200 on a WABA endpoint usually means the asset is not owned by " +
        "your business and your app only has Standard Access. Advanced Access is " +
        "required to touch assets you do not own.";
    } else if (e.code === 100) {
      hint =
        " HINT: code 100 often means the field or edge does not exist on this " +
        "API version, or the ID is of the wrong type.";
    } else if (e.code === 2500) {
      hint = " HINT: unknown path. Verify the edge name against Meta's reference docs.";
    }

    throw new Error(parts.join(", ") + "." + hint);
  }

  return data;
}

/** Build a `?fields=` query safely. */
function withFields(path, fields) {
  if (!fields) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}fields=${encodeURIComponent(fields)}`;
}

// ── Documentation helper ───────────────────────────────────────
const DOC_INDEX = {
  whatsapp: "https://developers.facebook.com/docs/whatsapp",
  coexistence:
    "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/coexistence",
  "embedded-signup": "https://developers.facebook.com/docs/whatsapp/embedded-signup",
  "embedded-signup-errors":
    "https://developers.facebook.com/docs/whatsapp/embedded-signup/errors/",
  "app-review": "https://developers.facebook.com/docs/whatsapp/embedded-signup/app-review/",
  templates:
    "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates",
  "graph-api": "https://developers.facebook.com/docs/graph-api",
  webhooks: "https://developers.facebook.com/docs/graph-api/webhooks",
  "whatsapp-webhooks":
    "https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks",
  marketing: "https://developers.facebook.com/docs/marketing-apis",
  messenger: "https://developers.facebook.com/docs/messenger-platform",
  instagram: "https://developers.facebook.com/docs/instagram-api",
  login: "https://developers.facebook.com/docs/facebook-login",
  "login-for-business":
    "https://developers.facebook.com/docs/facebook-login/facebook-login-for-business",
  pages: "https://developers.facebook.com/docs/pages",
  permissions: "https://developers.facebook.com/docs/permissions",
  changelog: "https://developers.facebook.com/docs/graph-api/changelog",
  "error-codes":
    "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes",
};

function searchMetaDocs(query) {
  const q = String(query || "").toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);

  const results = [];
  for (const [topic, url] of Object.entries(DOC_INDEX)) {
    const topicTokens = topic.split("-");
    const hit =
      q.includes(topic) ||
      topicTokens.some((t) => tokens.includes(t)) ||
      tokens.some((t) => t.length > 3 && topic.includes(t));
    if (hit) results.push({ topic, url });
  }

  return {
    query,
    matched_docs: results,
    full_text_search: `https://developers.facebook.com/search/?q=${encodeURIComponent(
      query
    )}&filters=docs`,
    note:
      "This is a curated link index, not a full-text search. Fetch the URLs to read " +
      "actual content, and prefer them over memory since Meta's WhatsApp docs change often.",
  };
}

// ── Tool definitions ──────────────────────────────────────────
const str = (description) => ({ type: "string", description });
const num = (description) => ({ type: "number", description });

const TOOLS = [
  // ============ Identity & tokens ============
  {
    name: "get_me",
    description: "Get the current authenticated user's profile (name, id, email).",
    inputSchema: {
      type: "object",
      properties: { fields: str("Comma-separated fields. Default 'id,name,email'.") },
    },
  },
  {
    name: "debug_token",
    description:
      "Inspect an access token: validity, expiry, scopes, granular_scopes (which WABAs/assets it can reach), and app. Uses app auth when available for a fuller result.",
    inputSchema: {
      type: "object",
      properties: { token: str("Token to inspect. Defaults to the configured user token.") },
    },
  },
  {
    name: "get_token_diagnostics",
    description:
      "Health check for THIS MCP server's credentials. Reports which auth modes are available, token expiry in days, granted scopes, and which tool groups will work. Run this first when a tool fails with a permission error.",
    inputSchema: { type: "object", properties: {} },
  },

  // ============ Apps ============
  {
    name: "list_apps",
    description: "List Meta apps the authenticated user can access.",
    inputSchema: {
      type: "object",
      properties: { fields: str("Comma-separated fields.") },
    },
  },
  {
    name: "get_app_info",
    description:
      "Get an app's configuration. Note: 'status' is not a valid field on this edge; use get_app_review_status for review state.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID."), fields: str("Comma-separated fields.") },
      required: ["app_id"],
    },
  },
  {
    name: "get_app_settings",
    description: "Get app security/platform settings (domains, callback URLs, policy URLs).",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID.") },
      required: ["app_id"],
    },
  },
  {
    name: "get_app_roles",
    description:
      "List app roles (admins, developers, testers). REQUIRES app auth. Use this to confirm a person can test while the app is in Development mode.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID.") },
      required: ["app_id"],
    },
  },
  {
    name: "get_app_review_status",
    description:
      "Check App Review submissions and which permissions have Advanced Access. Empty approved_permissions means Standard Access only.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID.") },
      required: ["app_id"],
    },
  },
  {
    name: "get_app_api_health",
    description: "API health for an app: error rates, call volumes, rate limit usage.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID.") },
      required: ["app_id"],
    },
  },
  {
    name: "check_api_deprecations",
    description: "Report the configured API version plus links to Meta's deprecation schedule.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID.") },
      required: ["app_id"],
    },
  },

  // ============ Webhooks ============
  {
    name: "get_app_subscriptions",
    description:
      "List app webhook subscriptions (object, callback URL, subscribed fields, active). REQUIRES app auth. Missing 'whatsapp_business_account' here is a common cause of silent message loss.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID.") },
      required: ["app_id"],
    },
  },
  {
    name: "create_webhook_subscription",
    description:
      "Create or update an app webhook subscription. WRITE operation — changes live message delivery. Confirm with the user first.",
    inputSchema: {
      type: "object",
      properties: {
        app_id: str("Meta App ID."),
        object: {
          type: "string",
          enum: [
            "user",
            "page",
            "permissions",
            "payments",
            "whatsapp_business_account",
            "instagram",
          ],
          description: "Object type to subscribe to.",
        },
        callback_url: str("HTTPS callback URL."),
        verify_token: str("Verification token your endpoint echoes back."),
        fields: str("Comma-separated fields, e.g. 'messages,message_template_status_update'."),
      },
      required: ["app_id", "object", "callback_url", "verify_token", "fields"],
    },
  },
  {
    name: "delete_webhook_subscription",
    description:
      "Delete an app webhook subscription. DESTRUCTIVE — stops event delivery for every connected customer. Confirm with the user first.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID."), object: str("Object type to unsubscribe.") },
      required: ["app_id", "object"],
    },
  },
  {
    name: "send_test_webhook",
    description: "Ask Meta to send a sample webhook payload to your callback URL.",
    inputSchema: {
      type: "object",
      properties: { app_id: str("Meta App ID."), object: str("Object type.") },
      required: ["app_id", "object"],
    },
  },

  // ============ Business portfolios ============
  {
    name: "get_business_accounts",
    description: "List Business Manager portfolios the user can access.",
    inputSchema: {
      type: "object",
      properties: { fields: str("Comma-separated fields.") },
    },
  },
  {
    name: "get_business_users",
    description:
      "List people in a Business portfolio with their roles. Use this to verify someone is a BUSINESS admin, which is separate from being an APP admin.",
    inputSchema: {
      type: "object",
      properties: { business_id: str("Business portfolio ID.") },
      required: ["business_id"],
    },
  },
  {
    name: "get_business_wabas",
    description:
      "List WhatsApp Business Accounts under a Business portfolio. 'owned' are the portfolio's own WABAs; 'client' are customer WABAs shared with it. Standard Access only reaches owned ones.",
    inputSchema: {
      type: "object",
      properties: {
        business_id: str("Business portfolio ID."),
        scope: {
          type: "string",
          enum: ["owned", "client", "both"],
          description: "Which set to list. Default 'both'.",
        },
      },
      required: ["business_id"],
    },
  },

  // ============ WhatsApp ============
  {
    name: "get_whatsapp_business_account",
    description: "Get WABA details (name, currency, timezone, review status, ownership).",
    inputSchema: {
      type: "object",
      properties: { waba_id: str("WABA ID."), fields: str("Comma-separated fields.") },
      required: ["waba_id"],
    },
  },
  {
    name: "get_whatsapp_phone_numbers",
    description:
      "List phone numbers on a WABA including platform_type and quality rating. platform_type distinguishes CLOUD_API from a coexistence (Business App) number.",
    inputSchema: {
      type: "object",
      properties: { waba_id: str("WABA ID.") },
      required: ["waba_id"],
    },
  },
  {
    name: "get_phone_number_details",
    description:
      "Deep detail for ONE phone number id: platform_type, verification, name status, throughput, messaging limit. The authoritative way to confirm whether a number is coexistence-enabled.",
    inputSchema: {
      type: "object",
      properties: {
        phone_number_id: str("Phone number ID."),
        fields: str("Override the default field set."),
      },
      required: ["phone_number_id"],
    },
  },
  {
    name: "get_waba_subscribed_apps",
    description:
      "List apps subscribed to a WABA's webhooks. If your app is absent, inbound messages and coexistence echoes never arrive.",
    inputSchema: {
      type: "object",
      properties: { waba_id: str("WABA ID.") },
      required: ["waba_id"],
    },
  },
  {
    name: "get_whatsapp_templates",
    description: "List message templates on a WABA with status and components.",
    inputSchema: {
      type: "object",
      properties: {
        waba_id: str("WABA ID."),
        fields: str("Comma-separated fields."),
        limit: num("Max results. Default 50."),
        status: {
          type: "string",
          enum: ["APPROVED", "PENDING", "REJECTED", "DISABLED"],
          description: "Filter by status.",
        },
      },
      required: ["waba_id"],
    },
  },
  {
    name: "send_whatsapp_message",
    description:
      "Send a real WhatsApp message via Cloud API. WRITE operation that costs money and reaches a real person. Always confirm recipient and content with the user first.",
    inputSchema: {
      type: "object",
      properties: {
        phone_number_id: str("Sender phone number ID."),
        to: str("Recipient in international format, digits only, e.g. '919876543210'."),
        type: { type: "string", enum: ["text", "template"], description: "Message type." },
        text_body: str("Body text (type='text')."),
        template_name: str("Template name (type='template')."),
        template_language: str("Language code. Default 'en_US'."),
      },
      required: ["phone_number_id", "to", "type"],
    },
  },

  // ============ Pages & Ads ============
  {
    name: "get_accounts",
    description: "List Facebook Pages the user manages.",
    inputSchema: {
      type: "object",
      properties: { fields: str("Comma-separated fields.") },
    },
  },
  {
    name: "get_ad_accounts",
    description: "List ad accounts with status and balance.",
    inputSchema: {
      type: "object",
      properties: { fields: str("Comma-separated fields."), limit: num("Max results.") },
    },
  },

  // ============ Docs & raw ============
  {
    name: "search_meta_docs",
    description:
      "Look up Meta developer documentation links by topic. Returns a curated index plus a full-text search URL.",
    inputSchema: {
      type: "object",
      properties: { query: str("Topic, e.g. 'coexistence' or 'embedded signup errors'.") },
      required: ["query"],
    },
  },
  {
    name: "get_platform_changelog",
    description: "Graph API changelog and breaking-change references.",
    inputSchema: {
      type: "object",
      properties: { limit: num("Entries to request. Default 10.") },
    },
  },
  {
    name: "graph_api_request",
    description:
      "Raw Graph API call to any endpoint. Use when no dedicated tool fits. Set auth='app' for /{app-id}/* endpoints that reject user tokens.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: str("Path starting with '/', e.g. '/me' or '/{waba-id}/phone_numbers'."),
        method: { type: "string", enum: ["GET", "POST", "DELETE"], description: "Default GET." },
        params: { type: "object", description: "Query params (GET) or JSON body (POST)." },
        auth: {
          type: "string",
          enum: ["user", "app"],
          description: "Credential to use. Default 'user'.",
        },
      },
      required: ["endpoint"],
    },
  },
];

// ── Handlers ──────────────────────────────────────────────────
const PHONE_FIELDS =
  "id,display_phone_number,verified_name,platform_type,code_verification_status," +
  "quality_rating,status,name_status,messaging_limit_tier,throughput,is_official_business_account";

async function handleTool(name, args) {
  switch (name) {
    // ---- Identity & tokens ----
    case "get_me":
      return graphApi(withFields("/me", args.fields || "id,name,email"));

    case "debug_token": {
      const target = args.token || USER_TOKEN;
      // Meta returns richer data (including scopes and expiry) when the
      // inspecting credential is the app itself.
      return graphApi(`/debug_token?input_token=${encodeURIComponent(target)}`, {
        auth: APP_TOKEN ? "app" : "user",
      });
    }

    case "get_token_diagnostics": {
      const report = {
        api_version: API_VERSION,
        auth_modes: {
          user_token: Boolean(USER_TOKEN),
          app_token: Boolean(APP_TOKEN),
          appsecret_proof: Boolean(APP_SECRET),
        },
        app_id: APP_ID || null,
      };

      if (!APP_TOKEN) {
        report.app_level_tools = "UNAVAILABLE";
        report.missing = MISSING_APP_CREDS;
      } else {
        report.app_level_tools = "available";
      }

      try {
        const dbg = await graphApi(
          `/debug_token?input_token=${encodeURIComponent(USER_TOKEN)}`,
          { auth: APP_TOKEN ? "app" : "user" }
        );
        const d = dbg.data || {};
        report.token = {
          valid: d.is_valid,
          type: d.type,
          app: d.application,
          user_id: d.user_id,
          scopes: d.scopes || [],
          waba_targets:
            (d.granular_scopes || []).find(
              (s) => s.scope === "whatsapp_business_management"
            )?.target_ids || [],
        };
        if (d.expires_at) {
          const days = Math.round((d.expires_at * 1000 - Date.now()) / 86400000);
          report.token.expires_in_days = days;
          report.token.expiry_warning =
            days <= 0
              ? "EXPIRED — regenerate now."
              : days < 14
              ? `Expires in ${days} days. Consider a System User token, which does not expire.`
              : null;
        } else {
          report.token.expires_in_days = "never (system user or app token)";
        }
      } catch (e) {
        report.token = { error: e.message };
      }

      return report;
    }

    // ---- Apps ----
    case "list_apps":
      return graphApi(
        withFields("/me/applications", args.fields || "id,name,category,app_type")
      );

    case "get_app_info":
      return graphApi(
        withFields(
          `/${args.app_id}`,
          args.fields ||
            "id,name,category,app_domains,namespace,app_type,auth_dialog_headline," +
              "daily_active_users,weekly_active_users,monthly_active_users," +
              "deauth_callback_url,privacy_policy_url,terms_of_service_url"
        )
      );

    case "get_app_settings":
      return graphApi(
        withFields(
          `/${args.app_id}`,
          "id,name,app_domains,auth_dialog_headline,deauth_callback_url," +
            "privacy_policy_url,terms_of_service_url,url_scheme_suffix,website_url"
        )
      );

    case "get_app_roles":
      return graphApi(`/${args.app_id}/roles`, { auth: "app" });

    case "get_app_review_status": {
      /**
       * WARNING FOR AGENTS — READ BEFORE INTERPRETING THIS RESULT.
       *
       * Meta does NOT expose App Review submission state through the Graph
       * API. The `/{app-id}/app_review_submissions` edge does not exist
       * (code 2500 "Unknown path components") and there is no
       * `app_review_status` field (code 100). Pending, in-review, and
       * rejected submissions are visible ONLY in the App Dashboard.
       *
       * `/{app-id}/permissions` returns permissions whose status is already
       * `live`. A permission under review is by definition not live yet, so
       * it CANNOT appear here. An absent permission therefore means
       * "not active yet" and says NOTHING about whether a review was
       * submitted.
       *
       * A previous version of this handler wrapped the nonexistent edge in
       * `.catch(() => ({ data: [] }))` and returned the empty array without
       * the error. That made "this endpoint does not exist" indistinguishable
       * from "nothing was ever submitted", and it caused a real incorrect
       * conclusion: an app with a review actively in progress was reported
       * as never having submitted one. Never reintroduce that pattern.
       */
      let permissions;
      try {
        permissions = await graphApi(
          withFields(`/${args.app_id}/permissions`, "permission,status"),
          { auth: APP_TOKEN ? "app" : "user" }
        );
      } catch (e) {
        return {
          app_id: args.app_id,
          live_permissions_error: e.message,
          submission_state: "NOT_AVAILABLE_VIA_API",
          dashboard_url: `https://developers.facebook.com/apps/${args.app_id}/app-review/submissions/`,
        };
      }

      const live = permissions.data || [];
      const liveNames = live.map((p) => p.permission);
      const waNeeded = ["whatsapp_business_management", "whatsapp_business_messaging"];
      const waMissing = waNeeded.filter((p) => !liveNames.includes(p));

      return {
        app_id: args.app_id,
        live_permissions: live,
        submission_state: "NOT_AVAILABLE_VIA_API",
        whatsapp_advanced_access: waMissing.length === 0 ? "ACTIVE" : "NOT_ACTIVE",
        whatsapp_permissions_not_live: waMissing,
        interpretation:
          waMissing.length === 0
            ? "Both WhatsApp permissions are live. Advanced Access is active."
            : `Not live yet: ${waMissing.join(", ")}. The app is operating at Standard ` +
              "Access for these, so Embedded Signup onboarding will fail with #2655111. " +
              "IMPORTANT: this does NOT indicate whether a review was submitted — a " +
              "submission that is in progress is invisible to the Graph API. Check the " +
              "dashboard URL below before drawing any conclusion about submission status.",
        dashboard_url: `https://developers.facebook.com/apps/${args.app_id}/app-review/submissions/`,
      };
    }

    case "get_app_api_health":
      return graphApi(
        withFields(
          `/${args.app_id}/app_api_health`,
          "endpoint,error_count,total_count,current_rate_limit_usage"
        ),
        { auth: APP_TOKEN ? "app" : "user" }
      );

    case "check_api_deprecations":
      return {
        app_id: args.app_id,
        configured_api_version: API_VERSION,
        references: {
          graph_changelog: DOC_INDEX.changelog,
          breaking_changes:
            "https://developers.facebook.com/docs/graph-api/changelog/breaking-changes",
          whatsapp_changelog:
            "https://developers.facebook.com/docs/whatsapp/cloud-api/changelog",
        },
        note:
          "Meta does not expose a machine-readable deprecation feed on this edge. " +
          "Fetch the changelog URLs to confirm dates.",
      };

    // ---- Webhooks ----
    case "get_app_subscriptions":
      return graphApi(`/${args.app_id}/subscriptions`, { auth: "app" });

    case "create_webhook_subscription":
      return graphApi(`/${args.app_id}/subscriptions`, {
        method: "POST",
        auth: "app",
        body: {
          object: args.object,
          callback_url: args.callback_url,
          verify_token: args.verify_token,
          fields: args.fields,
        },
      });

    case "delete_webhook_subscription":
      return graphApi(
        `/${args.app_id}/subscriptions?object=${encodeURIComponent(args.object)}`,
        { method: "DELETE", auth: "app" }
      );

    case "send_test_webhook":
      return graphApi(`/${args.app_id}/subscriptions/sample`, {
        method: "POST",
        auth: "app",
        body: { object: args.object },
      });

    // ---- Business ----
    case "get_business_accounts":
      return graphApi(
        withFields(
          "/me/businesses",
          args.fields || "id,name,verification_status,created_time,is_hidden"
        )
      );

    case "get_business_users": {
      const [people, systemUsers] = await Promise.all([
        graphApi(
          withFields(`/${args.business_id}/business_users`, "id,name,email,role,pending_email")
        ).catch((e) => ({ error: e.message, data: [] })),
        graphApi(withFields(`/${args.business_id}/system_users`, "id,name,role")).catch(
          (e) => ({ error: e.message, data: [] })
        ),
      ]);
      return {
        business_id: args.business_id,
        people: people.data || [],
        people_error: people.error,
        system_users: systemUsers.data || [],
        system_users_error: systemUsers.error,
        note:
          "A BUSINESS role here is different from an APP role from get_app_roles. " +
          "Embedded Signup asset ownership follows the business role.",
      };
    }

    case "get_business_wabas": {
      const scope = args.scope || "both";
      const fields = "id,name,currency,timezone_id,account_review_status,owner_business_info";
      const out = { business_id: args.business_id };

      if (scope === "owned" || scope === "both") {
        out.owned = await graphApi(
          withFields(`/${args.business_id}/owned_whatsapp_business_accounts`, fields)
        ).catch((e) => ({ error: e.message }));
      }
      if (scope === "client" || scope === "both") {
        out.client = await graphApi(
          withFields(`/${args.business_id}/client_whatsapp_business_accounts`, fields)
        ).catch((e) => ({ error: e.message }));
      }
      return out;
    }

    // ---- WhatsApp ----
    case "get_whatsapp_business_account":
      return graphApi(
        withFields(
          `/${args.waba_id}`,
          args.fields ||
            "id,name,currency,timezone_id,message_template_namespace," +
              "account_review_status,owner_business_info,business_verification_status"
        )
      );

    case "get_whatsapp_phone_numbers":
      return graphApi(withFields(`/${args.waba_id}/phone_numbers`, PHONE_FIELDS));

    case "get_phone_number_details": {
      const data = await graphApi(
        withFields(`/${args.phone_number_id}`, args.fields || PHONE_FIELDS)
      );
      if (data.platform_type) {
        // Deliberately NOT claiming that CLOUD_API rules out coexistence.
        //
        // An earlier version of this tool asserted exactly that, and it was
        // unverified. Coexistence puts a number on the Cloud API *and* the
        // WhatsApp Business app at the same time, so CLOUD_API is the
        // expected reading for a coexistence number too — the value cannot
        // separate the two cases on its own. Business Manager does label
        // some WABAs "WhatsApp Business app" in its UI, but that label has
        // no confirmed equivalent on this field.
        //
        // Reporting the raw value with an honest caveat is more useful than
        // a confident answer that may be wrong.
        data._interpretation =
          `platform_type='${data.platform_type}'. ON_PREMISE means the legacy ` +
          "On-Premise API. NOT_APPLICABLE usually means the number is not " +
          "fully set up. CLOUD_API means it is on the Cloud API, which does " +
          "NOT by itself tell you whether coexistence is active — verify " +
          "coexistence by whether smb_message_echoes webhooks actually arrive.";
      }
      return data;
    }

    case "get_waba_subscribed_apps":
      return graphApi(`/${args.waba_id}/subscribed_apps`);

    case "get_whatsapp_templates": {
      let path = withFields(
        `/${args.waba_id}/message_templates`,
        args.fields || "name,status,category,language,components,quality_score"
      );
      path += `&limit=${args.limit || 50}`;
      if (args.status) path += `&status=${encodeURIComponent(args.status)}`;
      return graphApi(path);
    }

    case "send_whatsapp_message": {
      const body = { messaging_product: "whatsapp", to: args.to };
      if (args.type === "text") {
        if (!args.text_body) throw new Error("text_body is required when type='text'.");
        body.type = "text";
        body.text = { body: args.text_body };
      } else if (args.type === "template") {
        if (!args.template_name)
          throw new Error("template_name is required when type='template'.");
        body.type = "template";
        body.template = {
          name: args.template_name,
          language: { code: args.template_language || "en_US" },
        };
      } else {
        throw new Error("type must be 'text' or 'template'.");
      }
      return graphApi(`/${args.phone_number_id}/messages`, { method: "POST", body });
    }

    // ---- Pages & Ads ----
    case "get_accounts":
      return graphApi(withFields("/me/accounts", args.fields || "id,name,category"));

    case "get_ad_accounts":
      return graphApi(
        withFields(
          "/me/adaccounts",
          args.fields || "id,name,account_status,currency,balance,amount_spent"
        ) + `&limit=${args.limit || 25}`
      );

    // ---- Docs & raw ----
    case "search_meta_docs":
      return searchMetaDocs(args.query);

    case "get_platform_changelog":
      return {
        requested_limit: args.limit || 10,
        references: {
          changelog: DOC_INDEX.changelog,
          breaking_changes:
            "https://developers.facebook.com/docs/graph-api/changelog/breaking-changes",
          whatsapp_changelog:
            "https://developers.facebook.com/docs/whatsapp/cloud-api/changelog",
        },
        note: "Meta serves the changelog as HTML only; fetch these URLs to read it.",
      };

    case "graph_api_request": {
      const method = args.method || "GET";
      let endpoint = args.endpoint;
      if (!endpoint || !endpoint.startsWith("/")) {
        throw new Error("endpoint must start with '/'.");
      }
      if (method === "GET" && args.params) {
        const qs = Object.entries(args.params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&");
        if (qs) endpoint += (endpoint.includes("?") ? "&" : "?") + qs;
      }
      return graphApi(endpoint, {
        method,
        auth: args.auth || "user",
        body: method !== "GET" ? args.params || {} : null,
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Server bootstrap ──────────────────────────────────────────
async function main() {
  const server = new Server(
    { name: "meta-graph-api", version: "3.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handleTool(name, args || {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
