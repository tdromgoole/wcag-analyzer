# Work Follow-ups — Accessibility Scanner

**Updated:** November 19, 2026  
**Purpose:** Track information and decisions to resolve at work. Extension implementation progress stays in [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md).

## 1. Records Retention and Archival Policy

**Status:** Unresolved — applicable policy is not yet known.

- [ ] Ask the organization's records management authority which Texas agency records schedule/classification applies to accessibility audit evidence.
- [ ] Confirm whether scan evidence, compliance reports, technical diagnostics, and working files have different requirements.
- [ ] Confirm any preservation holds or other restrictions that affect archival and deletion.
- [ ] Identify who approves the retention, archival, and deletion policy.
- [ ] Obtain the approved policy or a reference to its authoritative location.
- [ ] Record the decision below and bring the relevant requirements back to the extension plan.

**Current development decision:** Do not add automatic evidence cleanup while policy approval is outstanding. No fixed retention period or number of retained scans is assumed. Existing user-operated deletion controls are not an approved compliance retention policy.

**Decision / policy reference:** Pending.

**Contact / owner:** To identify at work.

## 2. Work-Application GitLab and AI Remediation Integration

**Status:** Future integration dependency — this workflow belongs to the work application, not the extension repository.

- [ ] Locate the work application's GitLab/AI remediation instructions and identify their owner.
- [ ] Identify which exported JSON fields the existing remediation workflow consumes.
- [ ] Confirm compatibility with schema 2.1, which omits verbatim image alternative text while retaining structural technical evidence.
- [ ] Confirm developer review and approval requirements for AI-proposed source and audit-record changes.
- [ ] Identify where the work-app workflow should record accessibility impact assessments and proposed **Needs Review** updates.
- [ ] Confirm that AI has no application-login or database-execution access.
- [ ] Share an approved workflow summary or sanitized field requirements for the extension's future integration work.

**Current development decision:** Continue extension-local assessment, fixtures, and tests independently. Do not invent work-app integration requirements or add application source metadata to browser exports.

**Workflow location / field dependencies:** Pending.

**Contact / owner:** To identify at work.

## 3. Future Secured Reporting Module

**Status:** Later-phase coordination — begin implementation after the evidence contract stabilizes.

- [ ] Identify the application owner responsible for authorizing the PHP reporting module.
- [ ] Confirm which existing authorization controls should protect imports, reports, and PDF exports.
- [ ] Confirm the approved application-side import process and who may execute database scripts.
- [ ] Confirm how audit records will remain logically separated from operational application data.
- [ ] Confirm requirements for date-specific reports, scan-run reports, historical evidence, and auditor attribution.

**Current development decision:** Keep database integration optional and outside the standalone extension. AI may propose database scripts but must not execute work-application database operations.

**Decisions / references:** Pending.

## Confirmed Decisions — No Follow-up Needed

- Full URL paths are allowed in evidence; query strings, fragments, and embedded credentials are excluded.
- The regression laboratory uses synthetic content and remains independent of the secured application.
- Auditor names are self-declared attribution, not authenticated identity; future authenticated-user mapping belongs to later integration work.

## Resolution Log

When an item is resolved, record the date, decision, approved reference, and affected plan section. Avoid copying credentials, sensitive application data, or confidential source material into this file.

| Date | Item | Decision / approved reference | Plan update needed |
|---|---|---|---|
| November 19, 2026 | Initial handoff | Work-app workflow is external; retention policy is unknown. | Keep these dependencies open; continue independent extension work. |
