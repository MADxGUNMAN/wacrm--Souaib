-- ============================================================
-- 062 — Allow template_type = 'flows'.
--
-- Missed in 061. A template whose call to action opens a WhatsApp Flow
-- has no distinct type in Meta's API — on the wire it is an ordinary
-- template carrying a FLOW button — but Meta's own wizard treats it as
-- its own starting point, and the editor needs the same distinction to
-- know it should show the Flow picker instead of a plain button list.
--
-- Same reasoning already applied to 'catalogue' and 'multi_product' in
-- 061, which are likewise "ordinary template + a particular button".
-- ============================================================

ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_template_type_check;

ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_template_type_check
  CHECK (template_type IN (
    'default',
    'carousel',
    'limited_time_offer',
    'order_details',
    'order_status',
    'authentication',
    'calling_permission_request',
    'catalogue',
    'multi_product',
    'flows'
  ));
