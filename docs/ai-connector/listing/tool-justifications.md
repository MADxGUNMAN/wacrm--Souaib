# Tool annotation justifications (paste into the ChatGPT portal)

Generated from tool-justifications.json. Each tool: the value the server sends, then the justification.

## get_profile

- **readOnlyHint: true** — Returns the signed-in user's name, role, workspace name and currency. Changes nothing.
- **openWorldHint: false** — Reads the user's own Replai account only.
- **destructiveHint: false** — Read-only.

## get_my_permissions

- **readOnlyHint: true** — Lists what this connection may do and why anything is blocked. Changes nothing.
- **openWorldHint: false** — Reads this connection's settings in Replai only.
- **destructiveHint: false** — Read-only.

## restrict_my_permissions

- **readOnlyHint: false** — Saves new settings on this connection (read-only mode, groups switched off, a lower daily message limit).
- **openWorldHint: false** — Changes this connection's settings in Replai only; nothing leaves the workspace.
- **destructiveHint: true** — Lowers the app's own access. It can only reduce permissions, never raise them, and raising them again needs the user in Replai Settings.

## disconnect

- **readOnlyHint: false** — Revokes this connection and its tokens.
- **openWorldHint: false** — Affects only this connection in Replai.
- **destructiveHint: true** — Revoking access can't be undone by the app; the user has to connect again.

## list_team_members

- **readOnlyHint: true** — Lists active members of the workspace (name, role) so conversations and deals can be assigned. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## search_contacts

- **readOnlyHint: true** — Searches contacts by name, phone, email, tag or source. Changes nothing.
- **openWorldHint: false** — Searches the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_contact

- **readOnlyHint: true** — Returns one contact with tags, recent notes and latest conversation. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## list_tags

- **readOnlyHint: true** — Lists the workspace's contact tags. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## list_custom_fields

- **readOnlyHint: true** — Lists the workspace's custom contact fields and their options. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## list_contact_notes

- **readOnlyHint: true** — Lists notes written by the team on one contact. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## create_contact

- **readOnlyHint: false** — Creates a contact (or returns the existing one with that phone number) and can add tags.
- **openWorldHint: false** — Writes to the user's own workspace only; nobody is contacted.
- **destructiveHint: false** — Additive and idempotent: an existing contact is returned, nothing is overwritten or deleted.

## update_contact

- **readOnlyHint: false** — Changes a contact's name, email or company.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: true** — Overwrites existing values; the previous value isn't kept.

## add_tags_to_contacts

- **readOnlyHint: false** — Adds tags to contacts, creating tags that don't exist yet; may start the workspace's 'tag added' automations.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: false** — Additive: existing tags are left as they are. More than 25 contacts needs a preview and the user's confirmation.

## remove_tags_from_contacts

- **readOnlyHint: false** — Removes tags from contacts.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: true** — Removes data. More than 25 contacts needs a preview and the user's confirmation.

## add_contact_note

- **readOnlyHint: false** — Adds a note to a contact as the signed-in user.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: false** — Additive: creates a new note, never edits or deletes one.

## set_custom_field

- **readOnlyHint: false** — Sets or clears one custom field value on a contact.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: true** — Overwrites or clears the previous value.

## list_conversations

- **readOnlyHint: true** — Lists inbox conversations with status, assignee and unread count. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_conversation

- **readOnlyHint: true** — Returns one conversation and whether WhatsApp's 24-hour reply window is open. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_messages

- **readOnlyHint: true** — Returns messages in one conversation, newest first. Doesn't mark them read. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only. Message text is marked as untrusted customer content.
- **destructiveHint: false** — Read-only.

## search_messages

- **readOnlyHint: true** — Searches message text from the last 90 days. Changes nothing.
- **openWorldHint: false** — Searches the user's own workspace only.
- **destructiveHint: false** — Read-only.

## update_conversation_status

- **readOnlyHint: false** — Sets a conversation to open, pending or closed.
- **openWorldHint: false** — Writes to the user's own workspace only; the customer isn't notified.
- **destructiveHint: true** — Overwrites the current status; closing hides it from the open inbox.

## assign_conversation

- **readOnlyHint: false** — Assigns a conversation to a team member or unassigns it; the assignee gets an in-app notification.
- **openWorldHint: false** — Writes to the user's own workspace only; the customer isn't notified.
- **destructiveHint: true** — Replaces the current assignee.

## mark_conversation_read

- **readOnlyHint: false** — Resets the conversation's unread count in Replai.
- **openWorldHint: false** — Changes a counter in the user's own workspace; no WhatsApp read receipt is sent.
- **destructiveHint: false** — Only resets an unread counter; no content is changed or removed.

## list_templates

- **readOnlyHint: true** — Lists the workspace's WhatsApp message templates and what each needs to be sent. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_template

- **readOnlyHint: true** — Returns one template's text, buttons and required variables. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## send_text_message

- **readOnlyHint: false** — Sends a WhatsApp message to a customer and records it in the conversation.
- **openWorldHint: true** — Delivers a message to an external recipient on WhatsApp.
- **destructiveHint: true** — A sent message can't be recalled. Safeguards: only inside WhatsApp's 24-hour window, a daily limit, a duplicate guard, and an optional preview + confirmation step set by the workspace owner.

## send_template_message

- **readOnlyHint: false** — Sends an approved WhatsApp template to one recipient; can create the contact for a new number if the user allowed that.
- **openWorldHint: true** — Delivers a message to an external recipient on WhatsApp.
- **destructiveHint: true** — A sent message can't be recalled. Safeguards: approved templates only, opted-out customers skipped for marketing, a daily limit, a duplicate guard and an optional preview + confirmation step.

## list_pipelines

- **readOnlyHint: true** — Lists sales pipelines and their stages with open-deal counts. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## list_deals

- **readOnlyHint: true** — Lists deals filtered by pipeline, stage, status, contact, assignee or value. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_deal

- **readOnlyHint: true** — Returns one deal with its stage, contact and notes. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## create_deal

- **readOnlyHint: false** — Creates an open deal for a contact in a pipeline.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: false** — Additive: creates a new deal, nothing is overwritten or deleted.

## update_deal

- **readOnlyHint: false** — Changes a deal's stage, title, value, close date, assignee or notes.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: true** — Overwrites existing values.

## close_deal

- **readOnlyHint: false** — Marks a deal won or lost.
- **openWorldHint: false** — Writes to the user's own workspace only.
- **destructiveHint: true** — Changes the deal's outcome and removes it from the open pipeline.

## list_broadcasts

- **readOnlyHint: true** — Lists broadcasts with status and delivery counts. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_broadcast

- **readOnlyHint: true** — Returns one broadcast's counts and most common failure reasons. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## preview_broadcast

- **readOnlyHint: false** — Stores a short-lived preview (audience, opt-outs, sample text) and returns its confirmation id. Nothing is sent.
- **openWorldHint: false** — Nothing leaves the workspace; it only prepares a preview.
- **destructiveHint: false** — Sends nothing and changes no CRM data; the preview expires after 10 minutes.

## send_broadcast

- **readOnlyHint: false** — Schedules the previewed WhatsApp template broadcast for delivery.
- **openWorldHint: true** — Delivers messages to many external recipients on WhatsApp.
- **destructiveHint: true** — Sent messages can't be recalled. Always two-step: it only runs with a single-use confirmation id from preview_broadcast that the user approved; recipients are capped per day and opted-out customers are skipped.

## cancel_scheduled_broadcast

- **readOnlyHint: false** — Moves a scheduled broadcast back to draft.
- **openWorldHint: false** — Changes a record in the user's own workspace; nobody is contacted.
- **destructiveHint: true** — Cancels a planned send and clears its schedule.

## list_automations

- **readOnlyHint: true** — Lists automations with trigger, on/off state and run counts. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## list_flows

- **readOnlyHint: true** — Lists chatbot flows with status and run counts. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## set_automation_active

- **readOnlyHint: false** — Switches an existing automation on or off.
- **openWorldHint: false** — Changes a setting in the user's own workspace; the tool itself sends nothing.
- **destructiveHint: true** — Turning an automation on or off changes what the workspace does for future customer events. Only the automation's creator may do it, and switching on is validated first.

## set_flow_status

- **readOnlyHint: false** — Activates a chatbot flow or pauses it (back to draft).
- **openWorldHint: false** — Changes a setting in the user's own workspace; the tool itself sends nothing.
- **destructiveHint: true** — Changes how the workspace answers future customer messages. Activation is validated first.

## get_dashboard_summary

- **readOnlyHint: true** — Returns dashboard totals (conversations, messages, contacts, deals) for a period. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_conversation_trend

- **readOnlyHint: true** — Returns inbound and outbound messages per day. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_response_times

- **readOnlyHint: true** — Returns first-response and resolution time statistics. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## get_template_performance

- **readOnlyHint: true** — Returns sent, delivered, read and replied counts per template. Changes nothing.
- **openWorldHint: false** — Reads the user's own workspace only.
- **destructiveHint: false** — Read-only.

## list_notifications

- **readOnlyHint: true** — Lists the signed-in user's in-app notifications. Doesn't mark them read. Changes nothing.
- **openWorldHint: false** — Reads the user's own notifications only.
- **destructiveHint: false** — Read-only.
