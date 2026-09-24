# Feature status files

One file per shipped or in-progress feature. Each one answers, for a
person or an agent joining cold: what the feature is, where its code
lives, which phases are done, where we stopped, and what is left.

These are **status** documents. Keep them short. Design rationale,
specifications and step-by-step runbooks belong in the topic docs under
`docs/`, and each status file links to its own.

Update the file when a phase closes or a blocker changes. If it starts
duplicating a plan document, cut it back.

| Feature                                           | State                                         |
| ------------------------------------------------- | --------------------------------------------- |
| [Google Sheets add-on](./google-sheets-addon.md)  | Built; awaiting Google review                 |
| [WhatsApp Coexistence](./whatsapp-coexistence.md) | Shipped; one manual Meta dashboard check left |
