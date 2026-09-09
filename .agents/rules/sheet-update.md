---
trigger: always_on
glob:
description: After completing any task, ask the user whether to log it in the Google Sheet, then append using the google-sheets MCP tool.
---

# Sheet Update Rule — Implementation Roadmap Logger

## When This Rule Applies

After **every completed prompt/task**, you MUST ask the user whether to log the change in the Google Sheet. This applies to any code change, bug fix, feature, refactor, investigation, or infrastructure task.

---

## Step 1: Ask the User (MANDATORY)

After finishing a task, ask the user in **2–3 lines max**. Examples:

- _"Can I add **'Fixed chart focus outline bug'** to the sheet, or skip for now?"_
- _"Done. Add **'Password form upgrade'** and **'Inbox tag management'** to the sheet?"_

**Rules for asking:**
- Keep it short — just the task title(s), no full descriptions.
- If you finished an **old pending task AND a new one**, mention both titles briefly.
- If the user sends a new prompt or changes instead of answering, treat it as "skip" and move on. Ask again after the new task is done (mentioning both the old unanswered one and the new one).
- If the user says "yes", "add", "add it", "add in sheet", etc. → proceed to Step 2.
- If the user says "no", "skip", or sends a new task → do NOT log. Move on.

---

## Step 2: Verify the MCP Tool is Available

Before writing, test the google-sheets MCP tool by calling `get_spreadsheet_info` with the spreadsheet ID below. If the tool fails or is not available, tell the user:

> _"The Google Sheets MCP tool is not running. Please turn it on and I'll retry."_

Do NOT proceed until the tool responds successfully.

---

## Step 3: Read the Last Row to Determine Next Task ID

**Spreadsheet ID:** `1BkG_eKhAmYR4_4rCbZgrnB8t265D-XxfxYFyniD3Jmc`
**Sheet Name:** `Implementation Roadmap`

1. Read column A to find the last used TASK-NNN number.
   - Read a range like `'Implementation Roadmap'!A2:A300` and find the last non-empty cell.
   - Parse the number from the last TASK-NNN value (e.g., `TASK-169` → next is `TASK-170`).

---

## Step 4: Append the Row Using `append_rows`

Use the `append_rows` MCP tool to append to the sheet. **Never overwrite or insert — always append.**

### Column Format (8 columns: A through H)

| Column | Header | What to Write |
|--------|--------|---------------|
| **A** | Task ID | `TASK-{next_number}` — zero-padded to 3 digits (e.g., `TASK-170`) |
| **B** | Feature & Milestone | Short title of the task (truncated to ~80 chars if needed, end with `...`) |
| **C** | Detailed Scope & Deliverables | Numbered list of key deliverables. Format: `1. First thing.\n2. Second thing.\n3. Third thing.` Use `\n` for line breaks between items. Be specific and technical. 3–6 items typical. |
| **D** | Status | `Done` (since we only log completed tasks) |
| **E** | Priority | One of: `High (Blocker)`, `High`, `Medium`, `Low` — judge by impact and urgency |
| **F** | Target Files & Modules | Key files touched, separated by `\n`. Use relative paths from src/. If many files, use `src/ (CRM Features & APIs)` as a catch-all. |
| **G** | Assignee | `Souaib` (always) |
| **H** | Technical Architecture & Gotchas | The most important technical insight, root cause, or verification result. End with ` (Completed: DD-MM-YYYY \| HH:MM AM/PM)` using current local time. Truncate to ~200 chars if needed, ending with `...` |

### Example append_rows Call

```
Tool: append_rows
Arguments: {
  "spreadsheet_id": "1BkG_eKhAmYR4_4rCbZgrnB8t265D-XxfxYFyniD3Jmc",
  "range": "'Implementation Roadmap'!A:H",
  "values": [
    [
      "TASK-170",
      "Fixed chart focus outline bug on dashboard bar charts",
      "1. Resolved unwanted focus outline and text selection bugs across all dashboard charts.\n2. Applied global CSS in globals.css to suppress SVG focus/selection.\n3. Updated BarChart component to be non-selectable and unfocusable.\n4. Refined pointer-events handling on chart axis ticks.",
      "Done",
      "Low",
      "src/app/globals.css\nsrc/components/tremor/bar-chart.tsx\nsrc/components/dashboard/response-time-chart.tsx",
      "Souaib",
      "SVG components are naturally focusable by browsers; explicit tabIndex={-1} and pointer-events-none on axis ticks prevent UI artifacts. (Completed: 27-08-2026 | 02:30 PM)"
    ]
  ],
  "input_option": "RAW"
}
```

---

## Step 5: Confirm to the User

After successful append, tell the user briefly:

> _"✅ Added **TASK-170** to the sheet."_

If it fails, show the error and offer to retry.

---

## Important Rules

1. **NEVER auto-log.** Always ask first.
2. **NEVER overwrite existing rows.** Only append new rows.
3. **One task per row.** If a prompt resulted in multiple distinct features, split them into separate rows with sequential TASK IDs.
4. **Assignee is always `Souaib`.**
5. **Status is always `Done`** (we only log after completion).
6. **Timestamp format:** `DD-MM-YYYY | HH:MM AM/PM` using the user's local timezone (IST, UTC+5:30).
7. **Use the google-sheets MCP tool** (`ServerName: google-sheets`). Do NOT write to the sheet via any other method.
8. **If the MCP tool is off**, ask the user to turn it on. Do not skip silently.
