# Accessibility Evidence Contract

**Date:** November 19, 2026  
**State:** Scan/snapshot preservation, optional local auditor attribution and evidence-event export implemented. Remediation, re-verification and reporting extensions remain planned. Full URL paths are approved; query strings, fragments, and embedded credentials remain excluded.

## Implemented scan format: 2.1

### Optional self-declared attribution

Schema 2.1 now supports the additive `attribution` field on scan reports, individual `manualChecks` decisions and keyboard `assessment` records. Missing legacy fields and explicit `null` mean unknown; they never inherit another event's actor. User decision: a missing auditor name does not block scanning.

Named attribution has exactly `auditorId` (local UUID v4), `firstName`, `lastName`, `identityType: "self-declared"` and `authenticated: false`. Both names are required to save a named profile, are trimmed, and are limited to 100 characters without control characters. Unknown keys or authenticated-identity claims are rejected by the evidence boundary. These names are a disclosed personal-information exception; technical evidence still excludes page content and application credentials.

Auditors use separate browser profiles/computers and installation-specific IDs. Each has one local profile; a UUID is not a cross-computer authenticated-person identifier. The user selected later work-application mapping rather than profile transfer. A shared-auditor picker and profile export/import are outside the current requirement.

### Criterion element summaries

Each newly calculated criterion record includes `elementCoverage`: observed rule-element counts by bucket, distinct located-target count, checks without locators, unavailable legacy node lists, supplementary candidate count and enumeration-limit flag. Repeated checks on one structural target count once in `uniqueLocatedTargets` but remain separate rule-element checks. These counts reference the report's existing findings rather than duplicating technical payloads.

`relevantElementEnumeration: "not-established"` and `completeAutomatedCoverage: false` make incomplete whole-criterion coverage explicit. Zero checks or candidates is not automatic non-applicability, and none of these summaries changes criterion status or fills a human review. Historical reports without summaries remain readable and are not silently regenerated or relabelled.

### Attribution capture and preservation

Capture the scan actor before the scan, and each decision's actor when it is recorded. Portable snapshot events use the report's scan actor; manual/keyboard events use their own decision actor. Review restoration and merge retain that actor's snapshot and original timestamp. Profile changes never retroactively fill unknown fields or relabel earlier evidence. Correcting the current name retains its UUID; clearing/switching profiles creates a new UUID on the next named save. No application-user mapping or authentication is implemented.

### Scan compatibility and privacy

New scans emit `schemaVersion: "2.1"`. This privacy revision removes verbatim `alternativeText` from all result and inventory nodes. `altPresent`, structural targets, rule IDs, numerical evidence, and manual-review behavior remain available. Privacy metadata declares `mode: "content-free"` and `alternativeTextIncluded: false`.

Readers accept legacy 2.0 and new 2.1 scan records. A reader accepting a legacy record does not certify that record as sanitized. Existing files, queued payloads, and browser downloads are not rewritten or deleted automatically. Legacy alternative text is excluded when constructing site-report evidence. Downstream tools that require verbatim alternative text must switch to authorized local source inspection; its removal is intentional and versioned.

**Legacy staging update:** Supported legacy staging/queue copies now remove `alternativeText`, normalize URL credentials/query/fragment values, and declare the transformation in privacy metadata. Original filesystem artifacts are unchanged. Changed staging content receives a new content ID with `sourceSnapshotIds` linkage to its prior staged ID. Unknown report roots, raw content fields and nonstructural targets stop the operation visibly. Migration compares the original staging transaction before committing, preserving concurrent submissions. This is a supported-export compatibility boundary, not a comprehensive adversarial JSON import validator; the future application importer still needs full schema validation.

The scanner continues to analyze content transiently in the browser. It must not persist content merely because it was needed for analysis. No embedded AI, telemetry, application credentials, source files, application build identifiers, or commit hashes belong in scan exports. Scanner/engine versions describe the evaluation tool, not the scanned application's build.

## Existing identities and status semantics

- Page identity derives from protocol, host, pathname, and optionally configured route inputs. These route inputs influence a hash but are not exported as text. State identity hashes the selected slot and recognized structural control state. Preserve existing identity behavior during migration.
- Page/state report filenames are SHA-256-derived and stable across rescans. They identify the mutable current snapshot, not a unique scan run.
- Criterion identifiers use WCAG numeric identifiers; rule identifiers identify automated rules. A structural locator is an observation at scan time, not a permanent element ID.
- Scan timestamps and manual-review timestamps are separate ISO timestamps. A review predating applicable evidence requires revalidation.
- Pass, Fail, Not Applicable, and incomplete evaluations remain distinct. No detected violations is not proof of criterion compliance. Every applicable criterion and relevant element needs evaluation coverage.
- Needs Review is a current verification requirement caused by possible changes or incomplete evaluation. It must not erase historical Pass/Fail evidence. Representative testing applies only to tested pages, states, and conditions.

## Approved path policy

The user confirmed on November 19, 2026 that full URL paths are acceptable but query strings must be excluded. This supersedes the earlier request for sensitive-segment redaction. Retain protocol, hostname, and pathname in page reports; omit query strings, fragments, and embedded credentials. Sitemap paths retain the pathname only. No route-template configuration is required for this policy.

Optional query/fragment route identity may continue to influence hashed identifiers without exporting the raw values. Preserve distinct hashed identities for different configured routes. Existing files are not automatically rewritten or deleted.

User clarified that remediation “file paths” means page URL paths and structural DOM locators only. Application source filenames are excluded from extension evidence and remain part of the separate authorized work-app development workflow.

## Implemented preservation contract: 1.0

New 2.1 scans include an additive `scanId` UUID, generated once for the scan and retained through review updates and retries. Older scans without it use a clearly labeled legacy reference containing the hashed page/state filename and known scan timestamp. No missing original timestamps or attribution are fabricated.

Every installed-extension completed scan and review submission is preserved before disk auto-save may be skipped, a download authorized, or a folder report replaced. The local snapshot store is bounded and fails visibly without evicting older evidence. Review restoration uses the latest dated preserved decisions even in download-only mode with Remember history off; optional comparison baselines remain opt-in.

Settings exports `reportType: preserved-evidence`, schema 1.0, containing `snapshots` plus `events`. Snapshot entries include a SHA-256 content ID, hashed report filename, original report, staging byte count and recording time. Events have stable IDs derived from snapshot ID and event kind/check ID; they reference the snapshot and scan, carry original evaluation/review time, recording time, outcomes or review status, and `attribution: null` until attribution is implemented. Repeated exports produce the same IDs for the same evidence.

Event types are `scan-evidence-preserved`, `manual-review-evidence-preserved`, and `keyboard-review-evidence-preserved`. These describe retained observations, including restored or merged historical decisions; they do not falsely claim that each repeat represents a new human action. A snapshot's full original report preserves page/state, criteria and technical findings. No-longer-detected findings are not automatically verified fixes.

Explicit folder archival writes immutable `preserved-snapshot` envelopes, schema 1.0, containing the report and event summaries. Read-back validation precedes release of the staging copy. Legacy archives without summaries remain interpretable from their original snapshots. Neither portable export nor download authorization confirms browser download completion. Neither mode can recover history overwritten before preservation was installed. Clearing extension storage/uninstalling can remove locally staged evidence; archive or export it first.

## Future history extensions

The following describes the broader target. Scan IDs, local auditor IDs and immutable snapshot IDs exist as described above; finding identities, authenticated-user mapping and source-change/remediation actions remain later-phase work.

| Entity | Identifier and relationship |
|---|---|
| Page | Existing hashed page identity; separate state key |
| Scan | Collision-resistant UUID assigned once when a scan completes, retained on retry/export |
| Auditor | Stable locally generated UUID; self-declared first/last-name attribution snapshot on each event |
| Finding | UUID within a scan; separate comparison fingerprint using rule plus structural target |
| Criterion | WCAG numeric identifier plus standard/version context |
| Review event | Current preservation events use stable snapshot/check-derived IDs; future action events must preserve linkage to page, state, criterion or scope check, and scan |
| Re-verification event | UUID referencing affected page/state and prior evidence; reason and uncertainty retained |
| Technical payload | Immutable payload identifier referenced by scan events; deduplicate identical sanitized payloads |

Events carry `contractVersion`, `eventId`, `eventType`, `occurredAt`, `recordedAt`, `pageId`, `stateId`, applicable `scanId`, and attribution where available. Event types include scan completed, manual decision recorded, remediation recorded, review required, and verification recorded. Store constrained structured reasons rather than arbitrary application content or source metadata. Retain unknown legacy attribution as unknown; do not invent names or dates.

Manually entered names are an explicitly disclosed personal-information exception, not authenticated identity. Future application-user mapping must preserve the original event attribution.

History stores compact events and outcomes. Remediation payloads store sanitized technical evidence. Preserve historical findings and superseded decisions without copying full diagnostics into every event. A rescan's missing finding is no longer detected, not automatically a verified remediation.

## Planned persistence and import guarantees

1. Preserve prior evidence before replacing the mutable current snapshot. A failed history write must fail visibly and keep recoverable data; never claim successful preservation based on a partial write.
2. Retries reuse event/scan IDs. An importer inserts an event ID once; identical repeats are idempotent. Conflicting content under an existing ID is rejected and reported, not overwritten.
3. Preserve conflicting concurrent events for review. Serialize local writes, but do not claim that a browser-local lock protects independent developers or Git merges.
4. An older imported scan remains historical and cannot silently replace newer current evidence. Record both evaluation time and import/recording time.
5. Legacy snapshot migration can record an imported snapshot with known dates and unknown earlier history. It cannot reconstruct events that were overwritten.
6. Verify referenced payloads and required fields before accepting an import. Unsupported versions fail visibly without replacing existing evidence. The future importer must validate structure, not trust the privacy label.
7. No automatic archival/deletion until the Texas agency records authority confirms classifications and an approved retention policy exists. Compact comparison history is not the retention system.

## Delivery dependencies

Validate the approved path policy at every persistence/export boundary. Implement history and attribution after their schemas and failure behavior are covered by meaningful regression cases. Preserve existing restore/merge, sitemap, and queue safeguards. Database scripts remain proposals for authorized developers; AI must not execute application database operations.

The user clarified that GitLab/AI remediation workflow instructions belong to the work application, not this extension repository. Treat its field-consumer inventory as a future integration dependency, not a prerequisite for extension-local fixtures or tests.

The user does not yet know the applicable Texas records-retention schedule. Classification and archival/deletion approval remain unresolved. Do not introduce automatic evidence cleanup; proceed with reversible evidence design and preservation work independently.
