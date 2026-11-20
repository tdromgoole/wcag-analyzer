# Local NVDA Laboratory Setup

**Updated:** November 19, 2026  
**Status:** Portable NVDA installed; real screen-reader verification explicitly deferred by the user.

## Installed

- `@guidepup/guidepup` 0.40.0, `@guidepup/playwright` 0.21.0, and `@guidepup/setup` 0.29.3 are pinned development dependencies.
- Guidepup installed its checksum-verified NVDA 2026.3 asset, version `0.2.1-2026.3`, under `%LOCALAPPDATA%\guidepup\nvda\all\0.2.1-2026.3\extracted`.
- This is a portable automation installation, not a system-wide NVDA installation or the user's normal screen-reader profile.
- The current Guidepup Windows setup command performs no operating-system configuration; the portable asset was installed separately.

## Verification status

Two Chrome/NVDA smoke tests were attempted before deferral. Neither passed the intended synthetic-heading assertion. The first captured no heading; the second produced real speech from the desktop rather than the fixture, showing that foreground focus was not reliable. These are setup failures, not accessibility findings or successful laboratory verification. The test processes were stopped afterward.

A follow-up test/profile preparation command was blocked after the user asked to defer NVDA testing. It did not run. Do not count the drafted foreground and loopback guards as verified.

## Prepared source, not yet validated

- `playwright.nvda.config.js` and `screen-reader-tests/nvda.spec.js` define a separate headed, serial, opt-in lane. Normal `npm test` and `npm run test:lab` do not invoke it.
- The drafted session preferences use the bundled eSpeak voice rather than assuming a particular OneCore voice is installed.
- A test-profile plugin and `scripts/prepare-nvda.js` are drafted to restrict the automation relay to loopback. The rejected follow-up did not install or exercise that plugin. Its integration with the pinned NVDA build still requires validation.
- The draft smoke test checks relay bindings and foreground identity before heading navigation, and avoids placing unrelated desktop speech into assertion errors.
- `npm run test:nvda` invokes profile preparation and a real interactive test. Leave this command deferred until testing is resumed.

## Resume checklist

- [ ] Confirm the desktop is available for an interactive test and the laboratory Chrome window can retain foreground focus.
- [ ] Verify the prepared profile loads and the relay binds only to loopback before any screen-reader navigation.
- [ ] Pass the synthetic heading assertion using actual NVDA speech output, with cleanup after success or failure.
- [ ] Retain only relevant synthetic test evidence and exact environment versions.
- [ ] Then extend the real-NVDA lane to announcements, dialogs and keyboard behavior; keep failed/skipped setup distinct from verified accessibility evidence.

Browser-only fixture development continues independently. Workplace human verification remains tracked in [WORK-FOLLOW-UPS.md](WORK-FOLLOW-UPS.md).
