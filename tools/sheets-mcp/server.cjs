#!/usr/bin/env node

/**
 * Google Sheets MCP Server — Replai WACRM edition
 * ================================================
 *
 * A comprehensive stdio MCP server exposing the full Google Sheets API v4
 * to AI agents. Uses a Google Cloud service account for authentication.
 *
 * ZERO external dependencies beyond @modelcontextprotocol/sdk (already in
 * the project). JWT signing and token exchange are handled with Node.js
 * built-in `crypto` module.
 *
 * FEATURES
 * --------
 * - Spreadsheet info & management
 * - Sheet/tab CRUD (add, delete, rename, duplicate, reorder)
 * - Read data (single range, multiple ranges, entire sheet)
 * - Write data (update, append, batch update, clear)
 * - Row/column operations (insert, delete, move, resize, hide/unhide)
 * - Formatting (bold, color, font, alignment, number format, borders)
 * - Merge/unmerge cells
 * - Freeze panes
 * - Sort range
 * - Find & replace
 * - Basic filter (set/clear)
 * - Conditional formatting (add, update, delete)
 * - Data validation (set, clear)
 * - Named ranges (create, update, delete, list)
 * - Protected ranges (add, update, delete)
 * - Notes (set, clear)
 * - Charts (add basic chart)
 * - Banded ranges (add, update, delete)
 * - Copy/cut-paste ranges
 * - Auto-fill
 * - Create new spreadsheets
 *
 * SECURITY
 * --------
 * - Service account key path is read from env var, never logged.
 * - Access tokens are cached and auto-refreshed.
 * - No secrets appear in tool output.
 */

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const { URL } = require("url");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// ── Configuration ──────────────────────────────────────────────
const SERVICE_ACCOUNT_KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
const DEFAULT_SPREADSHEET_ID = process.env.DEFAULT_SPREADSHEET_ID || "";

if (!SERVICE_ACCOUNT_KEY_PATH) {
  console.error(
    "ERROR: GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required.\n" +
    "Set it to the absolute path of your service account JSON key file."
  );
  process.exit(1);
}

let SERVICE_ACCOUNT;
try {
  SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_KEY_PATH, "utf8"));
} catch (err) {
  console.error(`ERROR: Cannot read service account key at ${SERVICE_ACCOUNT_KEY_PATH}: ${err.message}`);
  process.exit(1);
}

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

// ── JWT & Token Management ─────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

function base64url(input) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createSignedJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const segments = [base64url(JSON.stringify(header)), base64url(JSON.stringify(claims))];
  const signingInput = segments.join(".");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(SERVICE_ACCOUNT.private_key);

  return signingInput + "." + base64url(signature);
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60000) {
    return cachedToken;
  }

  const jwt = createSignedJWT();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }).toString();

  const resp = await httpRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = JSON.parse(resp);
  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

// ── HTTP Helper ────────────────────────────────────────────────
function httpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Sheets API Helpers ─────────────────────────────────────────
async function sheetsGet(path, queryParams = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(queryParams).toString();
  const sep = qs ? "?" : "";
  const url = `${SHEETS_BASE}${path}${sep}${qs}`;

  const resp = await httpRequest(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return JSON.parse(resp);
}

async function sheetsPost(path, body, queryParams = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(queryParams).toString();
  const sep = qs ? "?" : "";
  const url = `${SHEETS_BASE}${path}${sep}${qs}`;

  const resp = await httpRequest(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return JSON.parse(resp);
}

async function sheetsPut(path, body, queryParams = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams(queryParams).toString();
  const sep = qs ? "?" : "";
  const url = `${SHEETS_BASE}${path}${sep}${qs}`;

  const resp = await httpRequest(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return JSON.parse(resp);
}

function resolveSpreadsheetId(args) {
  return args.spreadsheet_id || DEFAULT_SPREADSHEET_ID;
}

function checkSpreadsheetId(id) {
  if (!id) {
    throw new Error(
      "spreadsheet_id is required. Provide it as a parameter or set DEFAULT_SPREADSHEET_ID env var."
    );
  }
}

// Helper to resolve sheet ID from name
async function resolveSheetId(spreadsheetId, sheetName) {
  const info = await sheetsGet(`/${spreadsheetId}`, { fields: "sheets.properties" });
  const sheet = info.sheets?.find(
    (s) => s.properties.title.toLowerCase() === sheetName.toLowerCase()
  );
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
  return sheet.properties.sheetId;
}

// Parse color string like "#FF0000" or {red, green, blue, alpha}
function parseColor(color) {
  if (typeof color === "object") return color;
  if (typeof color === "string" && color.startsWith("#")) {
    const hex = color.replace("#", "");
    return {
      red: parseInt(hex.substring(0, 2), 16) / 255,
      green: parseInt(hex.substring(2, 4), 16) / 255,
      blue: parseInt(hex.substring(4, 6), 16) / 255,
      alpha: 1,
    };
  }
  return { red: 0, green: 0, blue: 0, alpha: 1 };
}

// ── Tool Definitions ───────────────────────────────────────────
const TOOLS = [
  // ─── SPREADSHEET INFO & MANAGEMENT ───
  {
    name: "get_spreadsheet_info",
    description:
      "Get full metadata about a spreadsheet: title, locale, sheets list with properties, named ranges, and developer metadata. Use this to discover sheet IDs, titles, row/column counts, frozen rows, etc.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID. Defaults to the configured DEFAULT_SPREADSHEET_ID." },
        include_data: { type: "boolean", description: "If true, also returns cell data for all sheets (can be large). Default false." },
      },
    },
  },
  {
    name: "create_spreadsheet",
    description:
      "Create a brand new Google Spreadsheet. Returns the new spreadsheet ID and URL. Optionally specify initial sheet names.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the new spreadsheet." },
        sheet_names: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of sheet/tab names to create. If omitted, a single 'Sheet1' is created.",
        },
      },
      required: ["title"],
    },
  },

  // ─── SHEET/TAB MANAGEMENT ───
  {
    name: "list_sheets",
    description: "List all sheets/tabs in a spreadsheet with their IDs, titles, row count, column count, frozen rows/columns, and hidden status.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
      },
    },
  },
  {
    name: "add_sheet",
    description: "Add a new sheet/tab to the spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        title: { type: "string", description: "Name of the new sheet." },
        row_count: { type: "integer", description: "Initial number of rows. Default 1000." },
        column_count: { type: "integer", description: "Initial number of columns. Default 26." },
        index: { type: "integer", description: "Position to insert the sheet (0-based). If omitted, appended at end." },
        tab_color: { type: "string", description: "Tab color as hex string like '#FF0000'." },
      },
      required: ["title"],
    },
  },
  {
    name: "delete_sheet",
    description: "Delete a sheet/tab from the spreadsheet by name or sheet ID.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Name of the sheet to delete." },
        sheet_id: { type: "integer", description: "Numeric sheet ID (alternative to sheet_name)." },
      },
    },
  },
  {
    name: "rename_sheet",
    description: "Rename a sheet/tab.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Current name of the sheet." },
        new_name: { type: "string", description: "New name for the sheet." },
      },
      required: ["new_name"],
    },
  },
  {
    name: "duplicate_sheet",
    description: "Duplicate an existing sheet/tab within the same spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Name of the sheet to duplicate." },
        new_name: { type: "string", description: "Name for the duplicated sheet." },
        insert_index: { type: "integer", description: "Position for the new sheet (0-based)." },
      },
      required: ["sheet_name"],
    },
  },
  {
    name: "copy_sheet_to",
    description: "Copy a sheet from this spreadsheet to another spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Source spreadsheet ID." },
        sheet_name: { type: "string", description: "Name of the sheet to copy." },
        destination_spreadsheet_id: { type: "string", description: "Target spreadsheet ID to copy to." },
      },
      required: ["sheet_name", "destination_spreadsheet_id"],
    },
  },
  {
    name: "update_sheet_properties",
    description: "Update various properties of a sheet: title, tab color, hidden status, right-to-left, grid properties (row/column count).",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Current name of the sheet." },
        title: { type: "string", description: "New title (if renaming)." },
        hidden: { type: "boolean", description: "Set true to hide the sheet." },
        tab_color: { type: "string", description: "Tab color as hex '#RRGGBB'." },
        right_to_left: { type: "boolean", description: "Set right-to-left layout." },
        index: { type: "integer", description: "New position index (0-based) for reordering." },
      },
      required: ["sheet_name"],
    },
  },

  // ─── READING DATA ───
  {
    name: "read_range",
    description:
      "Read cell values from a specific range (e.g. 'Sheet1!A1:D10'). Returns a 2D array of values. If no range is specified, reads the entire first sheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        range: { type: "string", description: "A1 range notation like 'Sheet1!A1:D10' or 'PLAN TRACKER!A:G'. Defaults to first sheet if omitted." },
        major_dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "Whether to return data as rows or columns. Default ROWS." },
        value_render_option: { type: "string", enum: ["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"], description: "How values are rendered. Default FORMATTED_VALUE." },
        date_time_render_option: { type: "string", enum: ["SERIAL_NUMBER", "FORMATTED_STRING"], description: "How dates are rendered. Default FORMATTED_STRING." },
      },
    },
  },
  {
    name: "read_multiple_ranges",
    description: "Read multiple ranges in a single API call. More efficient than multiple read_range calls.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        ranges: {
          type: "array",
          items: { type: "string" },
          description: "Array of A1 ranges, e.g. ['Sheet1!A1:B5', 'Sheet2!C1:D3'].",
        },
        major_dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "Default ROWS." },
        value_render_option: { type: "string", enum: ["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"], description: "Default FORMATTED_VALUE." },
      },
      required: ["ranges"],
    },
  },
  {
    name: "get_cell_formatting",
    description:
      "Get detailed formatting info for cells in a range: fonts, colors, borders, number formats, alignment, etc.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        range: { type: "string", description: "A1 range to inspect, e.g. 'Sheet1!A1:C5'." },
      },
      required: ["range"],
    },
  },

  // ─── WRITING DATA ───
  {
    name: "write_range",
    description:
      "Write values to a specific range. Overwrites existing data in the range. Values should be a 2D array (array of rows).",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        range: { type: "string", description: "A1 range like 'Sheet1!A1:D3'." },
        values: {
          type: "array",
          items: { type: "array", items: {} },
          description: "2D array of values, e.g. [['A1','B1'],['A2','B2']].",
        },
        value_input_option: {
          type: "string",
          enum: ["RAW", "USER_ENTERED"],
          description: "RAW stores as-is. USER_ENTERED parses formulas and dates. Default USER_ENTERED.",
        },
      },
      required: ["range", "values"],
    },
  },
  {
    name: "append_rows",
    description:
      "Append rows of data after the last row with content in a sheet or range. Great for adding new entries to a table.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        range: { type: "string", description: "A1 range defining the table, e.g. 'Sheet1!A:G' or 'PLAN TRACKER!A:G'." },
        values: {
          type: "array",
          items: { type: "array", items: {} },
          description: "2D array of rows to append.",
        },
        value_input_option: { type: "string", enum: ["RAW", "USER_ENTERED"], description: "Default USER_ENTERED." },
        insert_data_option: {
          type: "string",
          enum: ["OVERWRITE", "INSERT_ROWS"],
          description: "OVERWRITE writes over existing rows; INSERT_ROWS inserts new rows. Default INSERT_ROWS.",
        },
      },
      required: ["range", "values"],
    },
  },
  {
    name: "batch_update_values",
    description: "Update multiple ranges in a single call. Each entry specifies a range and values.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              range: { type: "string" },
              values: { type: "array", items: { type: "array", items: {} } },
            },
            required: ["range", "values"],
          },
          description: "Array of {range, values} objects.",
        },
        value_input_option: { type: "string", enum: ["RAW", "USER_ENTERED"], description: "Default USER_ENTERED." },
      },
      required: ["data"],
    },
  },
  {
    name: "clear_range",
    description: "Clear all values from a range. Formatting and data validation are preserved.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        range: { type: "string", description: "A1 range to clear, e.g. 'Sheet1!A2:Z1000'." },
      },
      required: ["range"],
    },
  },

  // ─── ROW/COLUMN OPERATIONS ───
  {
    name: "insert_rows_or_columns",
    description: "Insert empty rows or columns at a specific position in a sheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "ROWS or COLUMNS." },
        start_index: { type: "integer", description: "0-based start index (inclusive). For rows, 0 = row 1." },
        end_index: { type: "integer", description: "0-based end index (exclusive). To insert 3 rows at row 5: start=4, end=7." },
        inherit_from_before: { type: "boolean", description: "If true, inherits formatting from the row/column before. Default true." },
      },
      required: ["sheet_name", "dimension", "start_index", "end_index"],
    },
  },
  {
    name: "delete_rows_or_columns",
    description: "Delete rows or columns from a sheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "ROWS or COLUMNS." },
        start_index: { type: "integer", description: "0-based start index (inclusive)." },
        end_index: { type: "integer", description: "0-based end index (exclusive)." },
      },
      required: ["sheet_name", "dimension", "start_index", "end_index"],
    },
  },
  {
    name: "move_dimension",
    description: "Move rows or columns from one position to another.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "ROWS or COLUMNS." },
        source_start: { type: "integer", description: "0-based start index of source range." },
        source_end: { type: "integer", description: "0-based end index (exclusive) of source range." },
        destination_index: { type: "integer", description: "0-based index to move to." },
      },
      required: ["sheet_name", "dimension", "source_start", "source_end", "destination_index"],
    },
  },
  {
    name: "resize_dimension",
    description: "Set the pixel size of specific rows or columns.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "ROWS or COLUMNS." },
        start_index: { type: "integer", description: "0-based start index." },
        end_index: { type: "integer", description: "0-based end index (exclusive)." },
        pixel_size: { type: "integer", description: "Size in pixels." },
      },
      required: ["sheet_name", "dimension", "start_index", "end_index", "pixel_size"],
    },
  },
  {
    name: "auto_resize_dimension",
    description: "Auto-resize rows or columns to fit their content.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "ROWS or COLUMNS." },
        start_index: { type: "integer", description: "0-based start index." },
        end_index: { type: "integer", description: "0-based end index (exclusive)." },
      },
      required: ["sheet_name", "dimension", "start_index", "end_index"],
    },
  },
  {
    name: "hide_unhide_dimension",
    description: "Hide or unhide rows or columns.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        dimension: { type: "string", enum: ["ROWS", "COLUMNS"], description: "ROWS or COLUMNS." },
        start_index: { type: "integer", description: "0-based start index." },
        end_index: { type: "integer", description: "0-based end index (exclusive)." },
        hidden: { type: "boolean", description: "true to hide, false to unhide." },
      },
      required: ["sheet_name", "dimension", "start_index", "end_index", "hidden"],
    },
  },

  // ─── FORMATTING ───
  {
    name: "format_cells",
    description:
      "Apply formatting to a range of cells. Supports bold, italic, font size, font family, text color, background color, horizontal/vertical alignment, wrap strategy, and number format.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row index." },
        end_row: { type: "integer", description: "0-based end row index (exclusive)." },
        start_column: { type: "integer", description: "0-based start column index." },
        end_column: { type: "integer", description: "0-based end column index (exclusive)." },
        bold: { type: "boolean", description: "Set bold." },
        italic: { type: "boolean", description: "Set italic." },
        strikethrough: { type: "boolean", description: "Set strikethrough." },
        underline: { type: "boolean", description: "Set underline." },
        font_size: { type: "integer", description: "Font size in points." },
        font_family: { type: "string", description: "Font family name, e.g. 'Arial', 'Roboto'." },
        text_color: { type: "string", description: "Text color as hex '#RRGGBB'." },
        background_color: { type: "string", description: "Background color as hex '#RRGGBB'." },
        horizontal_alignment: {
          type: "string",
          enum: ["LEFT", "CENTER", "RIGHT"],
          description: "Horizontal text alignment.",
        },
        vertical_alignment: {
          type: "string",
          enum: ["TOP", "MIDDLE", "BOTTOM"],
          description: "Vertical text alignment.",
        },
        wrap_strategy: {
          type: "string",
          enum: ["OVERFLOW_CELL", "CLIP", "WRAP"],
          description: "Text wrapping strategy.",
        },
        number_format_type: {
          type: "string",
          enum: ["TEXT", "NUMBER", "PERCENT", "CURRENCY", "DATE", "TIME", "DATE_TIME", "SCIENTIFIC"],
          description: "Number format type.",
        },
        number_format_pattern: { type: "string", description: "Custom number format pattern, e.g. '#,##0.00', 'yyyy-mm-dd'." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },
  {
    name: "set_borders",
    description: "Set borders on a range of cells. Supports top, bottom, left, right, inner horizontal, and inner vertical borders.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
        style: {
          type: "string",
          enum: ["DOTTED", "DASHED", "SOLID", "SOLID_MEDIUM", "SOLID_THICK", "NONE", "DOUBLE"],
          description: "Border style. Default SOLID.",
        },
        color: { type: "string", description: "Border color as hex '#RRGGBB'. Default black." },
        top: { type: "boolean", description: "Apply top border. Default true." },
        bottom: { type: "boolean", description: "Apply bottom border. Default true." },
        left: { type: "boolean", description: "Apply left border. Default true." },
        right: { type: "boolean", description: "Apply right border. Default true." },
        inner_horizontal: { type: "boolean", description: "Apply inner horizontal borders." },
        inner_vertical: { type: "boolean", description: "Apply inner vertical borders." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },
  {
    name: "merge_cells",
    description: "Merge a range of cells.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
        merge_type: {
          type: "string",
          enum: ["MERGE_ALL", "MERGE_COLUMNS", "MERGE_ROWS"],
          description: "MERGE_ALL merges all cells, MERGE_COLUMNS merges cells per column, MERGE_ROWS per row. Default MERGE_ALL.",
        },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },
  {
    name: "unmerge_cells",
    description: "Unmerge previously merged cells in a range.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },
  {
    name: "freeze_panes",
    description: "Freeze rows and/or columns in a sheet (like freeze header rows).",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        frozen_row_count: { type: "integer", description: "Number of rows to freeze from the top. 0 to unfreeze." },
        frozen_column_count: { type: "integer", description: "Number of columns to freeze from the left. 0 to unfreeze." },
      },
      required: ["sheet_name"],
    },
  },

  // ─── DATA OPERATIONS ───
  {
    name: "sort_range",
    description: "Sort a range of data by one or more columns.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
        sort_specs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column_index: { type: "integer", description: "0-based column index to sort by." },
              order: { type: "string", enum: ["ASCENDING", "DESCENDING"], description: "Sort order." },
            },
            required: ["column_index", "order"],
          },
          description: "Array of sort specifications.",
        },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column", "sort_specs"],
    },
  },
  {
    name: "find_and_replace",
    description: "Find and replace text across a sheet or the entire spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        find: { type: "string", description: "Text to find." },
        replacement: { type: "string", description: "Replacement text." },
        sheet_name: { type: "string", description: "Limit search to this sheet. If omitted, searches all sheets." },
        match_case: { type: "boolean", description: "Case-sensitive match. Default false." },
        match_entire_cell: { type: "boolean", description: "Match entire cell content only. Default false." },
        search_by_regex: { type: "boolean", description: "Treat 'find' as a regular expression. Default false." },
        include_formulas: { type: "boolean", description: "Also search within formulas. Default false." },
      },
      required: ["find", "replacement"],
    },
  },
  {
    name: "set_basic_filter",
    description: "Set a basic auto-filter on a sheet range.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },
  {
    name: "clear_basic_filter",
    description: "Remove the basic auto-filter from a sheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
      },
      required: ["sheet_name"],
    },
  },

  // ─── CONDITIONAL FORMATTING ───
  {
    name: "add_conditional_format_rule",
    description:
      "Add a conditional formatting rule to a sheet. Supports boolean conditions (e.g. cell value equals, contains, greater than) and gradient rules.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
        rule_type: {
          type: "string",
          enum: [
            "NUMBER_GREATER", "NUMBER_GREATER_THAN_EQ", "NUMBER_LESS", "NUMBER_LESS_THAN_EQ",
            "NUMBER_EQ", "NUMBER_NOT_EQ", "NUMBER_BETWEEN", "NUMBER_NOT_BETWEEN",
            "TEXT_CONTAINS", "TEXT_NOT_CONTAINS", "TEXT_STARTS_WITH", "TEXT_ENDS_WITH",
            "TEXT_EQ", "TEXT_NOT_EQ", "IS_EMPTY", "IS_NOT_EMPTY",
            "CUSTOM_FORMULA",
          ],
          description: "Type of condition.",
        },
        values: {
          type: "array",
          items: { type: "string" },
          description: "Values for the condition. Most rules need 1 value. BETWEEN needs 2. CUSTOM_FORMULA takes a formula string.",
        },
        background_color: { type: "string", description: "Background color hex when condition is met." },
        text_color: { type: "string", description: "Text color hex when condition is met." },
        bold: { type: "boolean", description: "Bold when condition is met." },
        italic: { type: "boolean", description: "Italic when condition is met." },
        index: { type: "integer", description: "Position of the rule (0-based). Lower index = higher priority." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column", "rule_type"],
    },
  },
  {
    name: "delete_conditional_format_rule",
    description: "Delete a conditional formatting rule by its index.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        rule_index: { type: "integer", description: "0-based index of the rule to delete." },
      },
      required: ["sheet_name", "rule_index"],
    },
  },
  {
    name: "get_conditional_format_rules",
    description: "List all conditional formatting rules on a sheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
      },
      required: ["sheet_name"],
    },
  },

  // ─── DATA VALIDATION ───
  {
    name: "set_data_validation",
    description:
      "Set data validation on a range. Supports dropdown lists, number ranges, date ranges, text rules, checkboxes, and custom formulas.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
        rule_type: {
          type: "string",
          enum: [
            "ONE_OF_LIST", "ONE_OF_RANGE", "NUMBER_BETWEEN", "NUMBER_GREATER",
            "NUMBER_LESS", "TEXT_CONTAINS", "TEXT_EQ", "IS_VALID_EMAIL", "IS_VALID_URL",
            "DATE_BETWEEN", "DATE_ON_OR_AFTER", "DATE_ON_OR_BEFORE",
            "CUSTOM_FORMULA", "BOOLEAN",
          ],
          description: "Type of validation.",
        },
        values: {
          type: "array",
          items: { type: "string" },
          description:
            "Values for validation. For ONE_OF_LIST: dropdown options. For number/date: boundary values. For ONE_OF_RANGE: a single range string. For CUSTOM_FORMULA: a formula. For BOOLEAN: leave empty.",
        },
        strict: { type: "boolean", description: "If true, rejects invalid input. If false, shows a warning. Default true." },
        show_dropdown: { type: "boolean", description: "Show dropdown UI for list validations. Default true." },
        input_message: { type: "string", description: "Help message shown when cell is selected." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column", "rule_type"],
    },
  },
  {
    name: "clear_data_validation",
    description: "Remove data validation from a range of cells.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },

  // ─── NAMED RANGES ───
  {
    name: "get_named_ranges",
    description: "List all named ranges in the spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
      },
    },
  },
  {
    name: "add_named_range",
    description: "Create a named range.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        name: { type: "string", description: "Name for the range (must be unique)." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
      },
      required: ["name", "sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },
  {
    name: "delete_named_range",
    description: "Delete a named range by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        named_range_id: { type: "string", description: "ID of the named range to delete (from get_named_ranges)." },
      },
      required: ["named_range_id"],
    },
  },

  // ─── PROTECTED RANGES ───
  {
    name: "protect_range",
    description: "Protect a range or entire sheet to prevent editing.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer", description: "0-based start row (omit with end_row to protect entire sheet)." },
        end_row: { type: "integer", description: "0-based end row (exclusive)." },
        start_column: { type: "integer", description: "0-based start column." },
        end_column: { type: "integer", description: "0-based end column (exclusive)." },
        description: { type: "string", description: "Description/reason for protection." },
        warning_only: { type: "boolean", description: "If true, shows a warning instead of blocking edits. Default false." },
      },
      required: ["sheet_name"],
    },
  },
  {
    name: "unprotect_range",
    description: "Remove protection from a range by its protected range ID.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        protected_range_id: { type: "integer", description: "ID of the protected range to remove (from get_spreadsheet_info)." },
      },
      required: ["protected_range_id"],
    },
  },

  // ─── NOTES ───
  {
    name: "set_note",
    description: "Set a note (comment) on a single cell.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        row: { type: "integer", description: "0-based row index." },
        column: { type: "integer", description: "0-based column index." },
        note: { type: "string", description: "Note text. Empty string to clear the note." },
      },
      required: ["sheet_name", "row", "column", "note"],
    },
  },

  // ─── COPY/CUT-PASTE ───
  {
    name: "copy_paste",
    description: "Copy a range and paste it to another location within the same spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        source_sheet_name: { type: "string", description: "Source sheet name." },
        source_start_row: { type: "integer" },
        source_end_row: { type: "integer" },
        source_start_column: { type: "integer" },
        source_end_column: { type: "integer" },
        dest_sheet_name: { type: "string", description: "Destination sheet name." },
        dest_start_row: { type: "integer" },
        dest_end_row: { type: "integer" },
        dest_start_column: { type: "integer" },
        dest_end_column: { type: "integer" },
        paste_type: {
          type: "string",
          enum: ["PASTE_NORMAL", "PASTE_VALUES", "PASTE_FORMAT", "PASTE_NO_BORDERS", "PASTE_FORMULA", "PASTE_DATA_VALIDATION", "PASTE_CONDITIONAL_FORMATTING"],
          description: "What to paste. Default PASTE_NORMAL.",
        },
        paste_orientation: {
          type: "string",
          enum: ["NORMAL", "TRANSPOSE"],
          description: "NORMAL or TRANSPOSE. Default NORMAL.",
        },
      },
      required: ["source_sheet_name", "source_start_row", "source_end_row", "source_start_column", "source_end_column", "dest_sheet_name", "dest_start_row", "dest_end_row", "dest_start_column", "dest_end_column"],
    },
  },
  {
    name: "cut_paste",
    description: "Cut a range and paste to another location (moves data, clears source).",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        source_sheet_name: { type: "string", description: "Source sheet name." },
        source_start_row: { type: "integer" },
        source_end_row: { type: "integer" },
        source_start_column: { type: "integer" },
        source_end_column: { type: "integer" },
        dest_sheet_name: { type: "string", description: "Destination sheet name." },
        dest_row: { type: "integer", description: "0-based destination row." },
        dest_column: { type: "integer", description: "0-based destination column." },
        paste_type: {
          type: "string",
          enum: ["PASTE_NORMAL", "PASTE_VALUES", "PASTE_FORMAT", "PASTE_NO_BORDERS", "PASTE_FORMULA"],
          description: "Default PASTE_NORMAL.",
        },
      },
      required: ["source_sheet_name", "source_start_row", "source_end_row", "source_start_column", "source_end_column", "dest_sheet_name", "dest_row", "dest_column"],
    },
  },

  // ─── AUTO-FILL ───
  {
    name: "auto_fill",
    description: "Auto-fill data from a source range into a target range (like dragging the fill handle).",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        source_start_row: { type: "integer" },
        source_end_row: { type: "integer" },
        source_start_column: { type: "integer" },
        source_end_column: { type: "integer" },
        target_start_row: { type: "integer", description: "Fill target start row (must overlap or be adjacent to source)." },
        target_end_row: { type: "integer" },
        target_start_column: { type: "integer" },
        target_end_column: { type: "integer" },
      },
      required: ["sheet_name", "source_start_row", "source_end_row", "source_start_column", "source_end_column", "target_start_row", "target_end_row", "target_start_column", "target_end_column"],
    },
  },

  // ─── BANDED RANGES ───
  {
    name: "add_banding",
    description: "Add alternating row/column colors (banding) to a range.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer" },
        end_row: { type: "integer" },
        start_column: { type: "integer" },
        end_column: { type: "integer" },
        header_color: { type: "string", description: "Header row color hex." },
        first_band_color: { type: "string", description: "First alternating color hex." },
        second_band_color: { type: "string", description: "Second alternating color hex." },
        footer_color: { type: "string", description: "Footer row color hex." },
      },
      required: ["sheet_name", "start_row", "end_row", "start_column", "end_column"],
    },
  },

  // ─── CHARTS ───
  {
    name: "add_chart",
    description:
      "Add a chart (bar, line, area, pie, column, scatter) to a sheet. The chart is embedded in the sheet.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet containing the data." },
        chart_type: {
          type: "string",
          enum: ["BAR", "LINE", "AREA", "COLUMN", "SCATTER", "COMBO", "STEPPED_AREA"],
          description: "Chart type.",
        },
        title: { type: "string", description: "Chart title." },
        data_start_row: { type: "integer", description: "0-based start row of data range." },
        data_end_row: { type: "integer", description: "0-based end row (exclusive)." },
        data_start_column: { type: "integer", description: "0-based start column." },
        data_end_column: { type: "integer", description: "0-based end column (exclusive)." },
        header_count: { type: "integer", description: "Number of header rows in data. Default 1." },
        position_row: { type: "integer", description: "Row to anchor the chart. Default 0." },
        position_column: { type: "integer", description: "Column to anchor the chart. Default 0." },
        offset_x: { type: "integer", description: "Pixel offset X from anchor cell." },
        offset_y: { type: "integer", description: "Pixel offset Y from anchor cell." },
        width: { type: "integer", description: "Chart width in pixels. Default 600." },
        height: { type: "integer", description: "Chart height in pixels. Default 400." },
      },
      required: ["sheet_name", "chart_type", "data_start_row", "data_end_row", "data_start_column", "data_end_column"],
    },
  },

  // ─── PIVOT TABLE ───
  {
    name: "add_pivot_table",
    description: "Create a pivot table from a data range.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        source_sheet_name: { type: "string", description: "Sheet with source data." },
        source_start_row: { type: "integer" },
        source_end_row: { type: "integer" },
        source_start_column: { type: "integer" },
        source_end_column: { type: "integer" },
        dest_sheet_name: { type: "string", description: "Sheet to place the pivot table." },
        dest_row: { type: "integer", description: "0-based row to anchor pivot table." },
        dest_column: { type: "integer", description: "0-based column to anchor pivot table." },
        row_group_columns: {
          type: "array",
          items: { type: "integer" },
          description: "0-based column indices to group by (rows of pivot table).",
        },
        column_group_columns: {
          type: "array",
          items: { type: "integer" },
          description: "0-based column indices for column groups.",
        },
        value_columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "integer", description: "0-based source column index." },
              function: {
                type: "string",
                enum: ["SUM", "COUNTA", "COUNT", "COUNTUNIQUE", "AVERAGE", "MAX", "MIN", "MEDIAN", "PRODUCT", "STDEV", "STDEVP", "VAR", "VARP", "CUSTOM"],
                description: "Summarize function.",
              },
            },
          },
          description: "Columns to aggregate.",
        },
      },
      required: ["source_sheet_name", "source_start_row", "source_end_row", "source_start_column", "source_end_column", "dest_sheet_name", "dest_row", "dest_column"],
    },
  },

  // ─── SPREADSHEET PROPERTIES ───
  {
    name: "update_spreadsheet_properties",
    description: "Update top-level spreadsheet properties like title, locale, time zone.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        title: { type: "string", description: "New spreadsheet title." },
        locale: { type: "string", description: "Locale code, e.g. 'en_US'." },
        time_zone: { type: "string", description: "Time zone, e.g. 'Asia/Kolkata'." },
      },
    },
  },

  // ─── TEXT-TO-COLUMNS ───
  {
    name: "text_to_columns",
    description: "Split a column of text into multiple columns by a delimiter.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "Spreadsheet ID." },
        sheet_name: { type: "string", description: "Sheet name." },
        start_row: { type: "integer" },
        end_row: { type: "integer" },
        column: { type: "integer", description: "0-based column index to split." },
        delimiter: { type: "string", description: "Delimiter character, e.g. ',' or '|'." },
        delimiter_type: {
          type: "string",
          enum: ["DETECT", "COMMA", "SEMICOLON", "PERIOD", "SPACE", "CUSTOM", "AUTODETECT"],
          description: "Delimiter type. Use CUSTOM with 'delimiter' param. Default AUTODETECT.",
        },
      },
      required: ["sheet_name", "start_row", "end_row", "column"],
    },
  },
];

// ── Tool Handlers ──────────────────────────────────────────────
async function handleTool(name, args) {
  const spreadsheetId = resolveSpreadsheetId(args);

  switch (name) {
    // ─── SPREADSHEET INFO ───
    case "get_spreadsheet_info": {
      checkSpreadsheetId(spreadsheetId);
      const fields = args.include_data
        ? "*"
        : "spreadsheetId,spreadsheetUrl,properties,sheets.properties,sheets.conditionalFormats,sheets.filterViews,sheets.basicFilter,namedRanges";
      return await sheetsGet(`/${spreadsheetId}`, { fields });
    }

    case "create_spreadsheet": {
      const body = {
        properties: { title: args.title },
      };
      if (args.sheet_names?.length) {
        body.sheets = args.sheet_names.map((name, i) => ({
          properties: { title: name, index: i },
        }));
      }
      return await sheetsPost("", body);
    }

    // ─── SHEET/TAB MANAGEMENT ───
    case "list_sheets": {
      checkSpreadsheetId(spreadsheetId);
      const info = await sheetsGet(`/${spreadsheetId}`, { fields: "sheets.properties" });
      return info.sheets?.map((s) => s.properties) || [];
    }

    case "add_sheet": {
      checkSpreadsheetId(spreadsheetId);
      const req = {
        properties: {
          title: args.title,
          ...(args.row_count && { gridProperties: { rowCount: args.row_count, columnCount: args.column_count || 26 } }),
          ...(args.index !== undefined && { index: args.index }),
          ...(args.tab_color && { tabColorStyle: { rgbColor: parseColor(args.tab_color) } }),
        },
      };
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, { requests: [{ addSheet: req }] });
    }

    case "delete_sheet": {
      checkSpreadsheetId(spreadsheetId);
      let sheetId = args.sheet_id;
      if (sheetId === undefined && args.sheet_name) {
        sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      }
      if (sheetId === undefined) throw new Error("Provide sheet_name or sheet_id.");
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ deleteSheet: { sheetId } }],
      });
    }

    case "rename_sheet": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId, title: args.new_name },
            fields: "title",
          },
        }],
      });
    }

    case "duplicate_sheet": {
      checkSpreadsheetId(spreadsheetId);
      const sourceSheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const req = { sourceSheetId };
      if (args.new_name) req.newSheetName = args.new_name;
      if (args.insert_index !== undefined) req.insertSheetIndex = args.insert_index;
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ duplicateSheet: req }],
      });
    }

    case "copy_sheet_to": {
      checkSpreadsheetId(spreadsheetId);
      const sourceSheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}/sheets/${sourceSheetId}:copyTo`, {
        destinationSpreadsheetId: args.destination_spreadsheet_id,
      });
    }

    case "update_sheet_properties": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const props = { sheetId };
      const fields = [];
      if (args.title) { props.title = args.title; fields.push("title"); }
      if (args.hidden !== undefined) { props.hidden = args.hidden; fields.push("hidden"); }
      if (args.tab_color) { props.tabColorStyle = { rgbColor: parseColor(args.tab_color) }; fields.push("tabColorStyle"); }
      if (args.right_to_left !== undefined) { props.rightToLeft = args.right_to_left; fields.push("rightToLeft"); }
      if (args.index !== undefined) { props.index = args.index; fields.push("index"); }
      if (!fields.length) throw new Error("No properties to update.");
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ updateSheetProperties: { properties: props, fields: fields.join(",") } }],
      });
    }

    // ─── READING DATA ───
    case "read_range": {
      checkSpreadsheetId(spreadsheetId);
      const range = args.range || "";
      const params = {};
      if (args.major_dimension) params.majorDimension = args.major_dimension;
      if (args.value_render_option) params.valueRenderOption = args.value_render_option;
      if (args.date_time_render_option) params.dateTimeRenderOption = args.date_time_render_option;
      if (range) {
        return await sheetsGet(`/${spreadsheetId}/values/${encodeURIComponent(range)}`, params);
      }
      return await sheetsGet(`/${spreadsheetId}/values:batchGet`, { ...params, ranges: "" });
    }

    case "read_multiple_ranges": {
      checkSpreadsheetId(spreadsheetId);
      const params = {};
      if (args.major_dimension) params.majorDimension = args.major_dimension;
      if (args.value_render_option) params.valueRenderOption = args.value_render_option;
      // batchGet uses repeated 'ranges' param
      const qs = args.ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
      const token = await getAccessToken();
      const url = `${SHEETS_BASE}/${spreadsheetId}/values:batchGet?${qs}${Object.entries(params).map(([k, v]) => `&${k}=${v}`).join("")}`;
      const resp = await httpRequest(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      return JSON.parse(resp);
    }

    case "get_cell_formatting": {
      checkSpreadsheetId(spreadsheetId);
      const result = await sheetsGet(`/${spreadsheetId}`, {
        ranges: args.range,
        fields: "sheets.data.rowData.values(effectiveFormat,userEnteredFormat,note)",
        includeGridData: "true",
      });
      return result.sheets?.[0]?.data?.[0]?.rowData || [];
    }

    // ─── WRITING DATA ───
    case "write_range": {
      checkSpreadsheetId(spreadsheetId);
      return await sheetsPut(
        `/${spreadsheetId}/values/${encodeURIComponent(args.range)}`,
        { range: args.range, majorDimension: "ROWS", values: args.values },
        { valueInputOption: args.value_input_option || "USER_ENTERED" }
      );
    }

    case "append_rows": {
      checkSpreadsheetId(spreadsheetId);
      return await sheetsPost(
        `/${spreadsheetId}/values/${encodeURIComponent(args.range)}:append`,
        { range: args.range, majorDimension: "ROWS", values: args.values },
        {
          valueInputOption: args.value_input_option || "USER_ENTERED",
          insertDataOption: args.insert_data_option || "INSERT_ROWS",
        }
      );
    }

    case "batch_update_values": {
      checkSpreadsheetId(spreadsheetId);
      return await sheetsPost(
        `/${spreadsheetId}/values:batchUpdate`,
        {
          valueInputOption: args.value_input_option || "USER_ENTERED",
          data: args.data.map((d) => ({ range: d.range, majorDimension: "ROWS", values: d.values })),
        }
      );
    }

    case "clear_range": {
      checkSpreadsheetId(spreadsheetId);
      return await sheetsPost(
        `/${spreadsheetId}/values/${encodeURIComponent(args.range)}:clear`,
        {}
      );
    }

    // ─── ROW/COLUMN OPERATIONS ───
    case "insert_rows_or_columns": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          insertDimension: {
            range: {
              sheetId,
              dimension: args.dimension,
              startIndex: args.start_index,
              endIndex: args.end_index,
            },
            inheritFromBefore: args.inherit_from_before !== false,
          },
        }],
      });
    }

    case "delete_rows_or_columns": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: args.dimension,
              startIndex: args.start_index,
              endIndex: args.end_index,
            },
          },
        }],
      });
    }

    case "move_dimension": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          moveDimension: {
            source: {
              sheetId,
              dimension: args.dimension,
              startIndex: args.source_start,
              endIndex: args.source_end,
            },
            destinationIndex: args.destination_index,
          },
        }],
      });
    }

    case "resize_dimension": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: args.dimension,
              startIndex: args.start_index,
              endIndex: args.end_index,
            },
            properties: { pixelSize: args.pixel_size },
            fields: "pixelSize",
          },
        }],
      });
    }

    case "auto_resize_dimension": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: args.dimension,
              startIndex: args.start_index,
              endIndex: args.end_index,
            },
          },
        }],
      });
    }

    case "hide_unhide_dimension": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: args.dimension,
              startIndex: args.start_index,
              endIndex: args.end_index,
            },
            properties: { hiddenByUser: args.hidden },
            fields: "hiddenByUser",
          },
        }],
      });
    }

    // ─── FORMATTING ───
    case "format_cells": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const format = {};
      const fields = [];

      if (args.bold !== undefined) { format.textFormat = { ...format.textFormat, bold: args.bold }; fields.push("userEnteredFormat.textFormat.bold"); }
      if (args.italic !== undefined) { format.textFormat = { ...format.textFormat, italic: args.italic }; fields.push("userEnteredFormat.textFormat.italic"); }
      if (args.strikethrough !== undefined) { format.textFormat = { ...format.textFormat, strikethrough: args.strikethrough }; fields.push("userEnteredFormat.textFormat.strikethrough"); }
      if (args.underline !== undefined) { format.textFormat = { ...format.textFormat, underline: args.underline }; fields.push("userEnteredFormat.textFormat.underline"); }
      if (args.font_size) { format.textFormat = { ...format.textFormat, fontSize: args.font_size }; fields.push("userEnteredFormat.textFormat.fontSize"); }
      if (args.font_family) { format.textFormat = { ...format.textFormat, fontFamily: args.font_family }; fields.push("userEnteredFormat.textFormat.fontFamily"); }
      if (args.text_color) { format.textFormat = { ...format.textFormat, foregroundColorStyle: { rgbColor: parseColor(args.text_color) } }; fields.push("userEnteredFormat.textFormat.foregroundColorStyle"); }
      if (args.background_color) { format.backgroundColorStyle = { rgbColor: parseColor(args.background_color) }; fields.push("userEnteredFormat.backgroundColorStyle"); }
      if (args.horizontal_alignment) { format.horizontalAlignment = args.horizontal_alignment; fields.push("userEnteredFormat.horizontalAlignment"); }
      if (args.vertical_alignment) { format.verticalAlignment = args.vertical_alignment; fields.push("userEnteredFormat.verticalAlignment"); }
      if (args.wrap_strategy) { format.wrapStrategy = args.wrap_strategy; fields.push("userEnteredFormat.wrapStrategy"); }
      if (args.number_format_type || args.number_format_pattern) {
        format.numberFormat = {};
        if (args.number_format_type) format.numberFormat.type = args.number_format_type;
        if (args.number_format_pattern) format.numberFormat.pattern = args.number_format_pattern;
        fields.push("userEnteredFormat.numberFormat");
      }

      if (!fields.length) throw new Error("No formatting properties specified.");

      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: args.start_row,
              endRowIndex: args.end_row,
              startColumnIndex: args.start_column,
              endColumnIndex: args.end_column,
            },
            cell: { userEnteredFormat: format },
            fields: fields.join(","),
          },
        }],
      });
    }

    case "set_borders": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const borderStyle = args.style || "SOLID";
      const borderColor = parseColor(args.color || "#000000");
      const border = { style: borderStyle, colorStyle: { rgbColor: borderColor } };

      const req = {
        range: {
          sheetId,
          startRowIndex: args.start_row,
          endRowIndex: args.end_row,
          startColumnIndex: args.start_column,
          endColumnIndex: args.end_column,
        },
      };
      if (args.top !== false) req.top = border;
      if (args.bottom !== false) req.bottom = border;
      if (args.left !== false) req.left = border;
      if (args.right !== false) req.right = border;
      if (args.inner_horizontal) req.innerHorizontal = border;
      if (args.inner_vertical) req.innerVertical = border;

      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ updateBorders: req }],
      });
    }

    case "merge_cells": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: args.start_row,
              endRowIndex: args.end_row,
              startColumnIndex: args.start_column,
              endColumnIndex: args.end_column,
            },
            mergeType: args.merge_type || "MERGE_ALL",
          },
        }],
      });
    }

    case "unmerge_cells": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          unmergeCells: {
            range: {
              sheetId,
              startRowIndex: args.start_row,
              endRowIndex: args.end_row,
              startColumnIndex: args.start_column,
              endColumnIndex: args.end_column,
            },
          },
        }],
      });
    }

    case "freeze_panes": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const gridProps = {};
      const fields = [];
      if (args.frozen_row_count !== undefined) { gridProps.frozenRowCount = args.frozen_row_count; fields.push("gridProperties.frozenRowCount"); }
      if (args.frozen_column_count !== undefined) { gridProps.frozenColumnCount = args.frozen_column_count; fields.push("gridProperties.frozenColumnCount"); }
      if (!fields.length) throw new Error("Specify frozen_row_count and/or frozen_column_count.");
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId, gridProperties: gridProps },
            fields: fields.join(","),
          },
        }],
      });
    }

    // ─── DATA OPERATIONS ───
    case "sort_range": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          sortRange: {
            range: {
              sheetId,
              startRowIndex: args.start_row,
              endRowIndex: args.end_row,
              startColumnIndex: args.start_column,
              endColumnIndex: args.end_column,
            },
            sortSpecs: args.sort_specs.map((s) => ({
              dimensionIndex: s.column_index,
              sortOrder: s.order,
            })),
          },
        }],
      });
    }

    case "find_and_replace": {
      checkSpreadsheetId(spreadsheetId);
      const req = {
        find: args.find,
        replacement: args.replacement,
        matchCase: args.match_case || false,
        matchEntireCell: args.match_entire_cell || false,
        searchByRegex: args.search_by_regex || false,
        includeFormulas: args.include_formulas || false,
        allSheets: !args.sheet_name,
      };
      if (args.sheet_name) {
        req.sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      }
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ findReplace: req }],
      });
    }

    case "set_basic_filter": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: args.start_row,
                endRowIndex: args.end_row,
                startColumnIndex: args.start_column,
                endColumnIndex: args.end_column,
              },
            },
          },
        }],
      });
    }

    case "clear_basic_filter": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ clearBasicFilter: { sheetId } }],
      });
    }

    // ─── CONDITIONAL FORMATTING ───
    case "add_conditional_format_rule": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const range = {
        sheetId,
        startRowIndex: args.start_row,
        endRowIndex: args.end_row,
        startColumnIndex: args.start_column,
        endColumnIndex: args.end_column,
      };

      const format = {};
      if (args.background_color) format.backgroundColorStyle = { rgbColor: parseColor(args.background_color) };
      if (args.text_color) format.textFormat = { foregroundColorStyle: { rgbColor: parseColor(args.text_color) } };
      if (args.bold) format.textFormat = { ...format.textFormat, bold: true };
      if (args.italic) format.textFormat = { ...format.textFormat, italic: true };

      const conditionValues = (args.values || []).map((v) => ({ userEnteredValue: v }));

      const rule = {
        ranges: [range],
        booleanRule: {
          condition: {
            type: args.rule_type,
            values: conditionValues,
          },
          format,
        },
      };

      const req = { rule, index: args.index || 0 };
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ addConditionalFormatRule: req }],
      });
    }

    case "delete_conditional_format_rule": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          deleteConditionalFormatRule: {
            sheetId,
            index: args.rule_index,
          },
        }],
      });
    }

    case "get_conditional_format_rules": {
      checkSpreadsheetId(spreadsheetId);
      const info = await sheetsGet(`/${spreadsheetId}`, {
        fields: "sheets(properties.title,properties.sheetId,conditionalFormats)",
      });
      const sheet = info.sheets?.find(
        (s) => s.properties.title.toLowerCase() === args.sheet_name.toLowerCase()
      );
      if (!sheet) throw new Error(`Sheet "${args.sheet_name}" not found.`);
      return sheet.conditionalFormats || [];
    }

    // ─── DATA VALIDATION ───
    case "set_data_validation": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const range = {
        sheetId,
        startRowIndex: args.start_row,
        endRowIndex: args.end_row,
        startColumnIndex: args.start_column,
        endColumnIndex: args.end_column,
      };

      let condition;
      const vals = args.values || [];

      if (args.rule_type === "ONE_OF_LIST") {
        condition = { type: "ONE_OF_LIST", values: vals.map((v) => ({ userEnteredValue: v })) };
      } else if (args.rule_type === "ONE_OF_RANGE") {
        condition = { type: "ONE_OF_RANGE", values: [{ userEnteredValue: vals[0] || "" }] };
      } else if (args.rule_type === "BOOLEAN") {
        condition = { type: "BOOLEAN_CONDITION", values: [] };
      } else if (args.rule_type === "CUSTOM_FORMULA") {
        condition = { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: vals[0] || "" }] };
      } else {
        condition = { type: args.rule_type, values: vals.map((v) => ({ userEnteredValue: v })) };
      }

      const rule = { condition, strict: args.strict !== false, showCustomUi: args.show_dropdown !== false };
      if (args.input_message) rule.inputMessage = args.input_message;

      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          setDataValidation: {
            range,
            rule,
          },
        }],
      });
    }

    case "clear_data_validation": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: args.start_row,
              endRowIndex: args.end_row,
              startColumnIndex: args.start_column,
              endColumnIndex: args.end_column,
            },
            rule: null, // null clears validation
          },
        }],
      });
    }

    // ─── NAMED RANGES ───
    case "get_named_ranges": {
      checkSpreadsheetId(spreadsheetId);
      const info = await sheetsGet(`/${spreadsheetId}`, { fields: "namedRanges" });
      return info.namedRanges || [];
    }

    case "add_named_range": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          addNamedRange: {
            namedRange: {
              name: args.name,
              range: {
                sheetId,
                startRowIndex: args.start_row,
                endRowIndex: args.end_row,
                startColumnIndex: args.start_column,
                endColumnIndex: args.end_column,
              },
            },
          },
        }],
      });
    }

    case "delete_named_range": {
      checkSpreadsheetId(spreadsheetId);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ deleteNamedRange: { namedRangeId: args.named_range_id } }],
      });
    }

    // ─── PROTECTED RANGES ───
    case "protect_range": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const protectedRange = {
        description: args.description || "",
        warningOnly: args.warning_only || false,
      };

      if (args.start_row !== undefined && args.end_row !== undefined) {
        protectedRange.range = {
          sheetId,
          startRowIndex: args.start_row,
          endRowIndex: args.end_row,
          startColumnIndex: args.start_column || 0,
          endColumnIndex: args.end_column,
        };
      } else {
        protectedRange.range = { sheetId };
      }

      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ addProtectedRange: { protectedRange } }],
      });
    }

    case "unprotect_range": {
      checkSpreadsheetId(spreadsheetId);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ deleteProtectedRange: { protectedRangeId: args.protected_range_id } }],
      });
    }

    // ─── NOTES ───
    case "set_note": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateCells: {
            rows: [{ values: [{ note: args.note }] }],
            start: { sheetId, rowIndex: args.row, columnIndex: args.column },
            fields: "note",
          },
        }],
      });
    }

    // ─── COPY/CUT-PASTE ───
    case "copy_paste": {
      checkSpreadsheetId(spreadsheetId);
      const srcSheetId = await resolveSheetId(spreadsheetId, args.source_sheet_name);
      const dstSheetId = await resolveSheetId(spreadsheetId, args.dest_sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          copyPaste: {
            source: {
              sheetId: srcSheetId,
              startRowIndex: args.source_start_row,
              endRowIndex: args.source_end_row,
              startColumnIndex: args.source_start_column,
              endColumnIndex: args.source_end_column,
            },
            destination: {
              sheetId: dstSheetId,
              startRowIndex: args.dest_start_row,
              endRowIndex: args.dest_end_row,
              startColumnIndex: args.dest_start_column,
              endColumnIndex: args.dest_end_column,
            },
            pasteType: args.paste_type || "PASTE_NORMAL",
            pasteOrientation: args.paste_orientation || "NORMAL",
          },
        }],
      });
    }

    case "cut_paste": {
      checkSpreadsheetId(spreadsheetId);
      const srcSheetId = await resolveSheetId(spreadsheetId, args.source_sheet_name);
      const dstSheetId = await resolveSheetId(spreadsheetId, args.dest_sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          cutPaste: {
            source: {
              sheetId: srcSheetId,
              startRowIndex: args.source_start_row,
              endRowIndex: args.source_end_row,
              startColumnIndex: args.source_start_column,
              endColumnIndex: args.source_end_column,
            },
            destination: { sheetId: dstSheetId, rowIndex: args.dest_row, columnIndex: args.dest_column },
            pasteType: args.paste_type || "PASTE_NORMAL",
          },
        }],
      });
    }

    // ─── AUTO-FILL ───
    case "auto_fill": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          autoFill: {
            useAlternateSeries: false,
            range: {
              sheetId,
              startRowIndex: args.target_start_row,
              endRowIndex: args.target_end_row,
              startColumnIndex: args.target_start_column,
              endColumnIndex: args.target_end_column,
            },
            sourceAndDestination: {
              source: {
                sheetId,
                startRowIndex: args.source_start_row,
                endRowIndex: args.source_end_row,
                startColumnIndex: args.source_start_column,
                endColumnIndex: args.source_end_column,
              },
              dimension: args.source_start_column === args.target_start_column ? "ROWS" : "COLUMNS",
              fillLength:
                args.source_start_column === args.target_start_column
                  ? args.target_end_row - args.source_end_row
                  : args.target_end_column - args.source_end_column,
            },
          },
        }],
      });
    }

    // ─── BANDING ───
    case "add_banding": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const bandedRange = {
        range: {
          sheetId,
          startRowIndex: args.start_row,
          endRowIndex: args.end_row,
          startColumnIndex: args.start_column,
          endColumnIndex: args.end_column,
        },
        rowProperties: {},
      };
      if (args.header_color) bandedRange.rowProperties.headerColorStyle = { rgbColor: parseColor(args.header_color) };
      if (args.first_band_color) bandedRange.rowProperties.firstBandColorStyle = { rgbColor: parseColor(args.first_band_color) };
      if (args.second_band_color) bandedRange.rowProperties.secondBandColorStyle = { rgbColor: parseColor(args.second_band_color) };
      if (args.footer_color) bandedRange.rowProperties.footerColorStyle = { rgbColor: parseColor(args.footer_color) };

      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ addBanding: { bandedRange } }],
      });
    }

    // ─── CHARTS ───
    case "add_chart": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const chartSpec = {
        title: args.title || "",
        basicChart: {
          chartType: args.chart_type,
          legendPosition: "BOTTOM_LEGEND",
          domains: [{
            domain: {
              sourceRange: {
                sources: [{
                  sheetId,
                  startRowIndex: args.data_start_row,
                  endRowIndex: args.data_end_row,
                  startColumnIndex: args.data_start_column,
                  endColumnIndex: args.data_start_column + 1,
                }],
              },
            },
          }],
          series: [],
          headerCount: args.header_count || 1,
        },
      };

      // Add series for each remaining column
      for (let col = args.data_start_column + 1; col < args.data_end_column; col++) {
        chartSpec.basicChart.series.push({
          series: {
            sourceRange: {
              sources: [{
                sheetId,
                startRowIndex: args.data_start_row,
                endRowIndex: args.data_end_row,
                startColumnIndex: col,
                endColumnIndex: col + 1,
              }],
            },
          },
          targetAxis: "LEFT_AXIS",
        });
      }

      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          addChart: {
            chart: {
              spec: chartSpec,
              position: {
                overlayPosition: {
                  anchorCell: {
                    sheetId,
                    rowIndex: args.position_row || 0,
                    columnIndex: args.position_column || 0,
                  },
                  offsetXPixels: args.offset_x || 0,
                  offsetYPixels: args.offset_y || 0,
                  widthPixels: args.width || 600,
                  heightPixels: args.height || 400,
                },
              },
            },
          },
        }],
      });
    }

    // ─── PIVOT TABLE ───
    case "add_pivot_table": {
      checkSpreadsheetId(spreadsheetId);
      const srcSheetId = await resolveSheetId(spreadsheetId, args.source_sheet_name);
      const dstSheetId = await resolveSheetId(spreadsheetId, args.dest_sheet_name);

      const pivotTable = {
        source: {
          sheetId: srcSheetId,
          startRowIndex: args.source_start_row,
          endRowIndex: args.source_end_row,
          startColumnIndex: args.source_start_column,
          endColumnIndex: args.source_end_column,
        },
        rows: (args.row_group_columns || []).map((col) => ({
          sourceColumnOffset: col,
          showTotals: true,
          sortOrder: "ASCENDING",
        })),
        columns: (args.column_group_columns || []).map((col) => ({
          sourceColumnOffset: col,
          showTotals: true,
          sortOrder: "ASCENDING",
        })),
        values: (args.value_columns || []).map((v) => ({
          sourceColumnOffset: v.column,
          summarizeFunction: v.function || "SUM",
        })),
      };

      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateCells: {
            rows: [{ values: [{ pivotTable }] }],
            start: { sheetId: dstSheetId, rowIndex: args.dest_row, columnIndex: args.dest_column },
            fields: "pivotTable",
          },
        }],
      });
    }

    // ─── SPREADSHEET PROPERTIES ───
    case "update_spreadsheet_properties": {
      checkSpreadsheetId(spreadsheetId);
      const props = {};
      const fields = [];
      if (args.title) { props.title = args.title; fields.push("title"); }
      if (args.locale) { props.locale = args.locale; fields.push("locale"); }
      if (args.time_zone) { props.autoRecalc = undefined; props.timeZone = args.time_zone; fields.push("timeZone"); }
      if (!fields.length) throw new Error("No properties to update.");
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateSpreadsheetProperties: {
            properties: props,
            fields: fields.join(","),
          },
        }],
      });
    }

    // ─── TEXT-TO-COLUMNS ───
    case "text_to_columns": {
      checkSpreadsheetId(spreadsheetId);
      const sheetId = await resolveSheetId(spreadsheetId, args.sheet_name);
      const req = {
        source: {
          sheetId,
          startRowIndex: args.start_row,
          endRowIndex: args.end_row,
          startColumnIndex: args.column,
          endColumnIndex: args.column + 1,
        },
        delimiterType: args.delimiter_type || "AUTODETECT",
      };
      if (args.delimiter) req.delimiter = args.delimiter;
      return await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
        requests: [{ textToColumns: req }],
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP Server Setup ───────────────────────────────────────────
const server = new Server(
  { name: "google-sheets-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const errMsg = err.message || String(err);
    return {
      content: [{ type: "text", text: `ERROR: ${errMsg}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Sheets MCP Server started successfully.");
  console.error(`Default spreadsheet: ${DEFAULT_SPREADSHEET_ID || "(none)"}`);
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
