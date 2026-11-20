# Phase 0 — Architecture and Compliance Evidence Update

> Architecture supplement to the [primary development plan and progress tracker](DEVELOPMENT-PLAN.md). Implementation work below maps to Phases 0–5 in that plan; later-phase features are not prerequisites for completing initial discovery. Track overall project progress in the primary plan.

**Status:** Proposed addition to existing development plan  
**Date:** November 19, 2026

## Objective

Establish a shared, versioned evidence architecture for the accessibility extension and future PHP/database reporting module. Develop the extension incrementally without requiring a database during initial development.

**Foundational requirement:** Evaluate every extension change for compatibility with both immediate accessibility scanning and future historical compliance reporting.

## Progress tracking

Check an item only when its work and relevant validation are complete. Record supporting evidence, decisions, and blockers in the progress log. Unchecked items remain open.

## 1. Inspect the Existing Implementation

Complete discovery before implementing changes.

- [ ] Inspect the extension’s scanning, manual review, remediation, and export workflows.
- [ ] Review existing JSON schemas, identifiers, and evidence storage.
- [ ] Review the sitemap export and how it identifies pages and views.
- [ ] Review the GitLab workflow and existing AI development instructions.
- [ ] Identify compatibility requirements, migration needs, and gaps.
- [ ] Document findings and update the implementation sequence.

**Deliverable:** Architecture inventory and gap assessment.

## 2. Establish the Shared Data Contract

- [ ] Define and document a versioned evidence contract.
- [ ] Define stable identifiers for pages, scans, findings, criteria, auditors, and review events.
- [ ] Define timestamp conventions and relationships between records.
- [ ] Distinguish scan outcomes, manual review decisions, and current verification status.
- [ ] Define how records are validated, migrated, and imported without duplication.
- [ ] Support local JSON evidence independently of the future database.
- [ ] Document how future reporting will reconstruct historical results.

**Acceptance criteria:**

- Extension exports can be validated against a documented schema.
- Historical records remain interpretable after schema changes.
- Reimporting the same evidence does not create duplicate records.
- A successful automated scan does not imply completion of manual review.

## 3. Define Privacy and Security Boundaries

- [ ] Export sanitized accessibility findings only.
- [ ] Preserve sanitized DOM ancestry paths for locating elements without IDs or classes.
- [ ] Define an explicit allowlist of exportable fields.
- [ ] Exclude page content, sensitive user data, application credentials, application build identifiers, and source metadata.
- [ ] Review URLs, selectors, attributes, and diagnostic fields for potential sensitive data.
- [ ] Preserve developer approval before applying AI-generated remediation.
- [ ] Document the sanitization rules and verify representative exports.

**Acceptance criteria:** Exported evidence supports element identification and remediation without exposing prohibited information.

## 4. Add Auditor Attribution

- [ ] Add first-name and last-name fields to the extension.
- [ ] Remember auditor information locally.
- [ ] Assign a stable local auditor identifier.
- [ ] Associate scans and manual review decisions with auditor attribution, timestamps, and stable event identifiers.
- [ ] Preserve attribution on historical events when locally stored names change.
- [ ] Clearly distinguish manually entered attribution from authenticated identity.

**Acceptance criteria:** Each scan and manual review decision retains the attribution recorded when the event occurred.

## 5. Design JSON Evidence and History

Investigate separating per-page evidence into two related record types before finalizing the storage design.

| Record type | Purpose | Expected contents |
|---|---|---|
| History JSON | Compact historical evidence | Scans, review decisions, outcomes, remediation references, and re-verification events |
| Remediation JSON | Detailed technical evidence for AI | Sanitized findings, element ancestry paths, and diagnostic details |

- [ ] Evaluate separation against the existing schema and workflows.
- [ ] Document the selected design and its tradeoffs.
- [ ] Link history and technical findings through stable identifiers.
- [ ] Preserve meaningful historical events.
- [ ] Avoid duplicating large diagnostic payloads unnecessarily.
- [ ] Define behavior for missing, conflicting, or repeated imports.
- [ ] Preserve the distinction between historical evidence and current status.

**Acceptance criteria:** Historical decisions remain traceable even when findings change, are resolved, or require re-verification.

## 6. Implement AI-Triggered Re-verification

- [ ] Add a development rule requiring AI to identify potentially affected views after source-code changes.
- [ ] Mark affected pages as **Needs Review** in their JSON audit records.
- [ ] Record the reason, scope, timestamp, and uncertainty of the impact assessment.
- [ ] Evaluate shared CSS, JavaScript, and component changes based on their actual reach.
- [ ] Avoid automatically flagging all 800-plus views for every minor shared change.
- [ ] Use representative regression scans when appropriate and document their coverage.
- [ ] Preserve review requirements for untested pages.
- [ ] Record uncertain impact rather than silently clearing review requirements.
- [ ] Define the evidence required to clear **Needs Review**.

**Acceptance criteria:**

- Changes produce a documented impact assessment.
- A representative scan verifies only the pages and conditions actually tested.
- Historical results remain available after a page becomes **Needs Review**.
- Uncertainty remains visible until resolved through review or verification.

## 7. Establish Retention and Archival Rules

- [ ] Confirm the applicable Texas agency records-retention classification with the responsible records authority.
- [ ] Document retention requirements for audit history and supporting technical evidence.
- [ ] Preserve meaningful scans, decisions, remediation events, and re-verification events.
- [ ] Avoid treating a fixed number of retained scans as sufficient.
- [ ] Define archival procedures that preserve record relationships and readability.
- [ ] Establish an approved deletion policy before implementing automatic cleanup.

**Acceptance criteria:** Automatic cleanup remains unimplemented until the applicable classification and archival/deletion policy are approved.

## 8. Prepare Future Database-Backed Reporting

After the evidence format is stable, build an authorized PHP reporting module inside the existing secured application.

- [ ] Design database storage around the shared evidence contract.
- [ ] Keep audit records logically separated from operational application data.
- [ ] Apply existing authorization controls to imports, reports, and exports.
- [ ] Implement validated imports with duplicate prevention.
- [ ] Support historical scan results and findings.
- [ ] Support auditor attribution and manual review decisions.
- [ ] Support remediation and re-verification history.
- [ ] Support reports for specific dates and scan runs.
- [ ] Show current verification status and outstanding issues.
- [ ] Provide PDF exports for compliance requests.

**Dependency:** Database importer and PHP reporting implementation begin after the scan evidence format is stable.

## 9. Development Sequence

1. Inspect the extension, JSON schema, sitemap export, and GitLab workflow.
2. Document architectural gaps and privacy boundaries.
3. Establish and validate the shared data contract.
4. Decide the history/remediation JSON structure.
5. Implement auditor attribution and evidence history.
6. Implement impact assessment and re-verification workflows.
7. Confirm retention requirements and approve archival/deletion policy.
8. Stabilize and validate evidence exports.
9. Build the database importer and secured PHP reporting module.

## Phase 0 Completion Criteria

- [ ] Existing implementation and compatibility gaps are documented.
- [ ] The shared, versioned data contract is documented and validated.
- [ ] Privacy and sanitization rules are defined.
- [ ] Auditor attribution and historical evidence behavior are specified.
- [ ] The JSON storage design is selected and documented.
- [ ] Re-verification rules preserve uncertainty and accurately represent tested coverage.
- [ ] Retention decisions and unresolved dependencies are recorded.
- [ ] Future importer and reporting requirements are defined.
- [ ] Follow-on implementation work is sequenced with clear dependencies.

## Progress Log

| Date | Item / section | Update and supporting evidence | Blockers / next action |
|---|---|---|---|
| November 19, 2026 | Plan | Initial proposed plan recorded; implementation items remain open. | Begin repository discovery. |
