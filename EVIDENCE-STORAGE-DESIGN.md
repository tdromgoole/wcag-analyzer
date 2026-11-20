# Evidence Storage Assessment and History Design

**Date:** November 19, 2026  
**Status:** Local snapshot preservation, portable JSON export, and explicit verified folder archival implemented; the full event ledger remains planned.

**Implementation update:** `recovery.js` retains each distinct submitted folder-save snapshot in a separate IndexedDB record set before the current save queue may coalesce it. Canonical content hashes deduplicate retries; a 100-snapshot/20 MiB limit rejects new evidence visibly without eviction. Existing snapshots survive pending-save deletion and reloads. Settings exports a portable JSON bundle without deleting local evidence. Explicit archival writes `access-lens-history/snapshot-<content-hash>.json`, verifies the saved identity/content by reading it back, then releases the redundant staging copy. Identical archived content is reused; conflicting nonempty files are not replaced. Interrupted empty files can be retried. Web Locks serialize archival within the browser's extension origin, not independent developers. Archived evidence is never automatically deleted. This is not a completed event ledger or retention system: browser-download-only exports and unsaved scan events are not yet comprehensively captured. Folder saves preserve the incoming state, validated preexisting disk snapshot, and final merged review result before replacement. Any required preservation failure blocks the replacement.

## Measurements

Reproduce the read-only assessment with `node scripts/analyze-evidence.js scans`. The utility reports sizes and counts without printing paths, selectors, element content, or findings. Measurements below cover one existing report, not a representative production distribution.

| Component | UTF-8 bytes |
|---|---:|
| Existing formatted report | 4,466,891 |
| Same report serialized compactly | 2,474,878 |
| Formatting whitespace | 1,992,013 |
| Results, compact field value | 1,758,176 |
| Inventory, compact field value | 630,824 |
| Keyboard transcript, compact field value | 52,083 |
| Derived WCAG coverage, compact field value | 28,431 |

Result categories contain 1 failing node (2,182 bytes), 18 incomplete nodes (28,878 bytes), 1,111 passing nodes (1,702,734 bytes), and 39 inapplicable rules with no nodes (24,327 bytes). Field-value sizes exclude enclosing property names and punctuation.

Across the entire report, 1,796 target arrays contain 594 distinct serialized targets. Repeated target arrays occupy 295,842 bytes beyond one copy of each. Repetition does not establish that the surrounding observations are redundant: a node can participate in several rules, inventories, and keyboard events.

## Evidence responsibilities

| Evidence | Purpose | Preservation requirement |
|---|---|---|
| Rule/check IDs, structural targets, relationships and measurements | Locate and investigate technical findings | Preserve sanitized historical observations; DOM paths are snapshots |
| Passing/incomplete checks and scope limitations | Explain evaluated coverage and uncertainty | Do not discard merely because there are no detected failures |
| Scan, review and re-verification events | Reconstruct who evaluated what and when | Preserve append-only events and superseded decisions |
| Current sitemap and coverage summaries | Fast navigation and current status | Treat as projections, not the authoritative historical ledger |
| Contrast/pixel and keyboard diagnostics | Explain measurement outcomes and interactions | Reference the corresponding immutable technical payload |
| Guidance/catalog descriptions | Human-readable interpretation | Consider versioned shared references later; do not remove before compatibility review |

## Selected direction

Keep JSON. This sample does not justify a different storage engine. Existing IndexedDB preferences and recovery queues remain in place.

Separate compact history events from detailed sanitized technical payloads. Preserve the current page/state JSON as a compatibility snapshot while adding immutable evidence separately. Prefer one event per JSON file under a history directory over repeatedly replacing one large per-page history array: independent files reduce merge collisions and permit idempotent retries. A later per-page history index can be rebuilt from events.

Use a distinct namespace/directory for immutable payloads so current top-level folder-report discovery does not mistake archived scans for current reports. Payload references must not depend on native filesystem paths. Scope IDs, attribution and event types follow [EVIDENCE-CONTRACT.md](EVIDENCE-CONTRACT.md).

Do not implement a diagnostic dictionary, compact all current exports, or remove passing evidence yet. First preserve original failures and review decisions, then measure write/serialization overhead with representative pages. Formatting accounts for about 45% of this sample's size, but readability and downstream review remain useful.

## Required write and recovery behavior

1. Generate stable scan and event IDs once and retain them through retries. Assign review-event IDs when decisions change, not each time the same snapshot is exported.
2. Validate and sanitize immutable payloads before writing them. Reuse a payload only when its sanitized content is identical; hashing must use documented deterministic serialization.
3. Write the referenced payload before the event that depends on it. Preserve any existing legacy snapshot before overwriting it. Mark migrated attribution/history as unknown rather than inventing evidence.
4. Preserve scan and manual-review events before replacing the mutable current snapshot. Partial writes fail visibly and leave recovery information; never report completed archival after only a snapshot save.
5. If an event/payload ID already exists, compare content. Identical content is a successful retry; different content is a visible conflict.
6. Queue every unsaved historical event. The current latest-per-filename coalescing queue cannot be the historical queue: it can replace an older unsaved scan. Add an independently keyed durable-event queue before enabling history preservation.
7. Retain existing saved-review merging and newer-scan conflict checks. A merged disk review needs its original review timestamp and attribution, not the current writer's identity.
8. Browser downloads need an explicit portable history export mechanism; they cannot promise atomic multi-file persistence or automatic restoration.
9. Local serialization does not lock another developer's browser or editor. Detect conflicts and preserve independently identified events; do not claim cross-developer transactional safety.
10. No automatic deletion or garbage collection until the approved retention policy exists. Orphaned payloads from interrupted writes remain recoverable and visible for later approved handling.

## Implementation gates

- Define machine-readable scan/history schemas and stable identity helpers.
- Cover first save, rescan, changed manual review, repeated save, failed payload/event write, retry, legacy migration, and conflicting IDs with regression tests.
- Prevent queue coalescing from dropping intermediate history.
- Preserve structural evidence used by current AI remediation; work-app consumer requirements remain a future integration dependency.
- Benchmark representative scan, serialization, and disk operations before adopting storage optimizations.

See [WORK-FOLLOW-UPS.md](WORK-FOLLOW-UPS.md) for retention approval and work-application dependencies. This design does not authorize deletion or claim that existing overwritten history can be recovered.
