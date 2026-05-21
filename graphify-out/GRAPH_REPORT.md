# Graph Report - wacrm--Souaib  (2026-05-21)

## Corpus Check
- 127 files · ~86,785 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 461 nodes · 566 edges · 17 communities detected
- Extraction: 78% EXTRACTED · 22% INFERRED · 0% AMBIGUOUS · INFERRED: 126 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 36 edges
2. `supabaseAdmin()` - 25 edges
3. `POST()` - 14 edges
4. `POST()` - 12 edges
5. `PATCH()` - 10 edges
6. `decrypt()` - 10 edges
7. `supabaseAdmin()` - 9 edges
8. `processMessage()` - 9 edges
9. `executeStepsFrom()` - 9 edges
10. `sendViaMeta()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `createClient()`  [INFERRED]
  src\app\api\automations\route.ts → src\lib\supabase\server.ts
- `DELETE()` --calls--> `createClient()`  [INFERRED]
  src\app\api\whatsapp\config\route.ts → src\lib\supabase\server.ts
- `load()` --calls--> `createClient()`  [INFERRED]
  src\app\(dashboard)\automations\page.tsx → src\lib\supabase\server.ts
- `load()` --calls--> `createClient()`  [INFERRED]
  src\app\(dashboard)\automations\[id]\logs\page.tsx → src\lib\supabase\server.ts
- `fetchBroadcasts()` --calls--> `createClient()`  [INFERRED]
  src\app\(dashboard)\broadcasts\page.tsx → src\lib\supabase\server.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (19): fetchTemplates(), fetchMissing(), fetchTags(), calculateReach(), ImportModal(), POST(), fetchData(), handleDelete() (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.17
Nodes (25): supabaseAdmin(), appendResults(), claimTimeAutomationRun(), evaluateCondition(), executeAutomation(), executeStepsFrom(), finalizeLog(), getNextCheckMsForAutomation() (+17 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (22): DELETE(), GET(), POST(), normalizeCategory(), normalizeStatus(), POST(), findOrCreateContact(), findOrCreateConversation() (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (19): GET(), POST(), insertSteps(), loadStepsTree(), replaceSteps(), seedsToTree(), uid(), getTemplate() (+11 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (20): engineSendTemplate(), engineSendText(), sendViaMeta(), adminDb(), POST(), checkRateLimit(), rateLimitResponse(), sweepExpired() (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (17): GET(), isDocument(), POST(), downloadMedia(), getMediaUrl(), sendAudioMessage(), sendContactMessage(), sendDocumentMessage() (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (7): addStepAt(), blankConfig(), cid(), patch(), set(), toggleContact(), onChange()

### Community 7 - "Community 7"
Cohesion: 0.3
Nodes (8): daysAgoStart(), lastNDayKeys(), localDayKey(), mondayIndex(), startOfLocalDay(), loadConversationsSeries(), loadMetrics(), loadResponseTime()

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (4): DashboardShellInner(), useAuth(), getPageTitle(), Header()

### Community 11 - "Community 11"
Cohesion: 0.48
Nodes (6): fetchBroadcasts(), handleVisibilityChange(), percent(), RateCell(), startPolling(), stopPolling()

### Community 13 - "Community 13"
Cohesion: 0.33
Nodes (2): fetchTags(), handleSave()

### Community 14 - "Community 14"
Cohesion: 0.47
Nodes (3): confirmDelete(), duplicate(), load()

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (2): parseCronResponse(), tick()

### Community 22 - "Community 22"
Cohesion: 0.6
Nodes (3): fetchTemplates(), handleSave(), handleSyncFromMeta()

### Community 28 - "Community 28"
Cohesion: 0.83
Nodes (3): GET(), POST(), requireAdmin()

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (2): cn(), Badge()

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): processFile(), walkDir()

## Knowledge Gaps
- **Thin community `Community 13`** (7 nodes): `confirmDelete()`, `fetchTags()`, `handleDelete()`, `handleSave()`, `openEditDialog()`, `toggleContact()`, `tag-manager.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (5 nodes): `dev-with-automation-cron.mjs`, `parseCronResponse()`, `readEnvFile()`, `scheduleNext()`, `tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (4 nodes): `cn()`, `badge.tsx`, `utils.ts`, `Badge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (3 nodes): `replace_colors.js`, `processFile()`, `walkDir()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 11`, `Community 14`, `Community 28`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `supabaseAdmin()` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 4` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `createClient()` (e.g. with `load()` and `load()`) actually correct?**
  _`createClient()` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `supabaseAdmin()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`supabaseAdmin()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `POST()` (e.g. with `createClient()` and `checkRateLimit()`) actually correct?**
  _`POST()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `POST()` (e.g. with `createClient()` and `checkRateLimit()`) actually correct?**
  _`POST()` has 10 INFERRED edges - model-reasoned connections that need verification._