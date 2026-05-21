# Graph Report - wacrm--Souaib  (2026-05-20)

## Corpus Check
- 122 files · ~78,109 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 428 nodes · 515 edges · 15 communities detected
- Extraction: 77% EXTRACTED · 23% INFERRED · 0% AMBIGUOUS · INFERRED: 119 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 32|Community 32]]

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 35 edges
2. `supabaseAdmin()` - 22 edges
3. `POST()` - 14 edges
4. `PATCH()` - 10 edges
5. `POST()` - 10 edges
6. `decrypt()` - 10 edges
7. `supabaseAdmin()` - 9 edges
8. `processMessage()` - 9 edges
9. `executeStepsFrom()` - 9 edges
10. `sendViaMeta()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `createClient()`  [INFERRED]
  src\app\api\automations\route.ts → src\lib\supabase\server.ts
- `load()` --calls--> `createClient()`  [INFERRED]
  src\app\(dashboard)\automations\page.tsx → src\lib\supabase\server.ts
- `load()` --calls--> `createClient()`  [INFERRED]
  src\app\(dashboard)\automations\[id]\logs\page.tsx → src\lib\supabase\server.ts
- `fetchBroadcasts()` --calls--> `createClient()`  [INFERRED]
  src\app\(dashboard)\broadcasts\page.tsx → src\lib\supabase\server.ts
- `handleSaveDraft()` --calls--> `createClient()`  [INFERRED]
  src\app\(dashboard)\broadcasts\new\page.tsx → src\lib\supabase\server.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (24): fetchTemplates(), fetchFields(), fetchTags(), calculateReach(), DELETE(), GET(), POST(), ImportModal() (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (26): supabaseAdmin(), appendResults(), evaluateCondition(), executeAutomation(), executeStepsFrom(), finalizeLog(), interpolate(), markPending() (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (23): engineSendTemplate(), engineSendText(), sendViaMeta(), POST(), checkRateLimit(), rateLimitResponse(), sweepExpired(), buildContactPayload() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.17
Nodes (17): GET(), isDocument(), POST(), downloadMedia(), getMediaUrl(), sendAudioMessage(), sendContactMessage(), sendDocumentMessage() (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.16
Nodes (5): addStepAt(), blankConfig(), cid(), set(), onChange()

### Community 5 - "Community 5"
Cohesion: 0.31
Nodes (12): findOrCreateContact(), findOrCreateConversation(), flagBroadcastReplyIfAny(), handleStatusUpdate(), isValidStatusTransition(), ladderLevel(), parseMessageContent(), POST() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.3
Nodes (8): daysAgoStart(), lastNDayKeys(), localDayKey(), mondayIndex(), startOfLocalDay(), loadConversationsSeries(), loadMetrics(), loadResponseTime()

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (8): GET(), POST(), getTemplate(), nonEmpty(), validateOne(), validateStepsForActivation(), validateTriggerForActivation(), walk()

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (4): DashboardShellInner(), useAuth(), getPageTitle(), Header()

### Community 11 - "Community 11"
Cohesion: 0.48
Nodes (6): fetchBroadcasts(), handleVisibilityChange(), percent(), RateCell(), startPolling(), stopPolling()

### Community 13 - "Community 13"
Cohesion: 0.47
Nodes (3): confirmDelete(), duplicate(), load()

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (2): fetchTags(), handleCreate()

### Community 20 - "Community 20"
Cohesion: 0.6
Nodes (3): fetchTemplates(), handleSave(), handleSyncFromMeta()

### Community 26 - "Community 26"
Cohesion: 0.83
Nodes (3): normalizeCategory(), normalizeStatus(), POST()

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (2): cn(), Badge()

## Knowledge Gaps
- **Thin community `Community 16`** (6 nodes): `confirmDelete()`, `fetchTags()`, `handleCreate()`, `handleDelete()`, `saving()`, `tag-manager.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (4 nodes): `cn()`, `badge.tsx`, `utils.ts`, `Badge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 7`, `Community 11`, `Community 13`, `Community 26`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `supabaseAdmin()` connect `Community 1` to `Community 0`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 34 inferred relationships involving `createClient()` (e.g. with `load()` and `load()`) actually correct?**
  _`createClient()` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `supabaseAdmin()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`supabaseAdmin()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `POST()` (e.g. with `createClient()` and `checkRateLimit()`) actually correct?**
  _`POST()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `PATCH()` (e.g. with `supabaseAdmin()` and `loadStepsTree()`) actually correct?**
  _`PATCH()` has 6 INFERRED edges - model-reasoned connections that need verification._