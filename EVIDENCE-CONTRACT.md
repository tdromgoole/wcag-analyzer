# Accessibility Evidence Contract

**Date:** November 19, 2026  
**State:** Current scan contract documented; history extension is a design specification pending implementation. Full URL paths are approved; query strings, fragments, and embedded credentials remain excluded.

## Implemented scan format: 2.1

New scans emit `schemaVersion: "2.1"`. This privacy revision removes verbatim `alternativeText` from all result and inventory nodes. `altPresent`, structural targets, rule IDs, numerical evidence, and manual-review behavior remain available. Privacy metadata declares `mode: "content-free"` and `alternativeTextIncluded: false`.

Readers accept legacy 2.0 and new 2.1 scan records. A reader accepting a legacy record does not certify that record as sanitized. Existing files, queued payloads, and browser downloads are not rewritten or deleted automatically. Legacy alternative text is excluded when constructing site-report evidence. Downstream tools that require verbatim alternative text must switch to authorized local source inspection; its removal is intentional and versioned.

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

## Planned history contract: 1.0

This section specifies future fields; none should be interpreted as already emitted by the extension.

| Entity | Identifier and relationship |
|---|---|
| Page | Existing hashed page identity; separate state key |
| Scan | Collision-resistant UUID assigned once when a scan completes, retained on retry/export |
| Auditor | Stable locally generated UUID; self-declared first/last-name attribution snapshot on each event |
| Finding | UUID within a scan; separate comparison fingerprint using rule plus structural target |
| Criterion | WCAG numeric identifier plus standard/version context |
| Review event | UUID referencing page, state, criterion or scope check, and applicable scan |
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
