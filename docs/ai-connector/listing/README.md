# AI connector — directory submission kit (Phase 10)

Everything needed to submit Replai to the **Claude Connectors Directory** and
the **ChatGPT plugin directory**. The process itself is in
[07-deploy-and-publish.md](../07-deploy-and-publish.md) §2–§4; this folder
holds the material you paste or upload.

| File                                                        | Used for                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [claude-directory.md](claude-directory.md)                  | Every field of the Claude developer portal (claude.ai/directory/manage)                          |
| [chatgpt-portal.md](chatgpt-portal.md)                      | ChatGPT portal fields, 5 + 3 test cases, release notes, video script                             |
| `chatgpt-plugin/`                                           | The ZIP package for the ChatGPT portal (`.codex-plugin/plugin.json`, `.mcp.json`, icon)          |
| [tool-justifications.json](tool-justifications.json)        | One justification per annotation per tool (ChatGPT requires all 141; Claude reviewers read them) |
| [reviewer-demo.md](reviewer-demo.md)                        | How to build and maintain the "Replai Demo" reviewer workspace                                   |
| `assets/replai-icon-1024.png`, `assets/replai-icon-600.png` | Square icon (the R mark on white). Use the 600 px one if a portal shows the 1024 px one soft     |

`src/lib/ai-connector/listing.test.ts` keeps this kit honest: it fails if a
tool is added without a justification, if a justification argues for an
annotation value the server doesn't send, or if the ChatGPT manifest breaks
the portal's length limits.

## Shared facts (both portals)

| Field                 | Value                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Name                  | Replai                                                                                                     |
| Developer / publisher | Junkies Coder (must match the verified identity on OpenAI)                                                 |
| MCP server URL        | `https://wacrm.junkiescoder.com/mcp` (Streamable HTTP, POST)                                               |
| Authentication        | OAuth 2.1 + PKCE, CIMD with DCR fallback; Universal URL                                                    |
| Documentation         | https://wacrm.junkiescoder.com/integrations/ai                                                             |
| Privacy policy        | https://wacrm.junkiescoder.com/privacy                                                                     |
| Terms                 | https://wacrm.junkiescoder.com/terms                                                                       |
| Support               | https://wacrm.junkiescoder.com/contact                                                                     |
| Tools                 | 47 (26 read-only, 21 write of which 15 destructive; 3 open-world: the two send tools and `send_broadcast`) |

## Order of work

1. Finish the reviewer workspace ([reviewer-demo.md](reviewer-demo.md)):
   created and seeded; connect its Meta test number and templates.
2. Run the five positive and three negative test cases in Claude and in
   ChatGPT against the demo login; record the video walkthrough.
3. Submit to Claude ([claude-directory.md](claude-directory.md)).
4. Submit to ChatGPT ([chatgpt-portal.md](chatgpt-portal.md)) — needs the
   OpenAI identity verification first, and the domain-verification token in
   `PROD_ENV` (`OPENAI_APPS_CHALLENGE_TOKEN`).
5. After approval: publish (ChatGPT needs an explicit **Publish**), put the
   listing links on `/integrations/ai` and in Settings → AI Connectors.

## Status (24 Oct 2026)

| Portal  | State                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT | **Approved and published**, version 1.0.0: https://chatgpt.com/plugins/plugin_asdk_app_6ac8dee28e288191b785a43de4cac406. Links added. |
| Claude  | **In review** since 8 Oct 2026. Listing link not added yet.                                                                           |
