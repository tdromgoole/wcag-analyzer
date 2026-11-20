# Phase 0 — Synthetic Performance Baseline

**Date:** November 19, 2026  
**Command:** `node scripts/benchmark-scan.js`  
**Environment:** Headless Chrome 157.0.8103.80; axe-core 4.14.0; 70 selected rules; viewport 1280 × 800; two sequential measurements per size.

All content is synthetic and served on loopback. No secured application, scan archive, or application credentials are used.

## Measured ranges

| Stage | Small: 95 elements | Medium: 615 elements | Large: 2,415 elements |
|---|---:|---:|---:|
| Engine and available second-pass processing | 19.8–52.2 ms | 70.0–78.2 ms | 235.8–243.5 ms |
| Informational inventory | 4.1–4.3 ms | 8.6–9.3 ms | 66.9–67.1 ms |
| Export construction, including supplementary snapshot | 3.8–6.1 ms | 47.4–49.7 ms | 533.9–538.5 ms |
| Formatted JSON serialization | 1.4–1.7 ms | 9.0–9.4 ms | 33.5 ms |
| Local preservation: normalization, hash and IndexedDB | 10.3–13.0 ms | 51.0–62.8 ms | 191.3–205.6 ms |
| Browser-side measured pipeline total | 39.7–77.4 ms | 187.1–209.0 ms | 1,069.4–1,080.9 ms |
| Separate Node filesystem write | 1.6–1.7 ms | 5.2–7.3 ms | 15.1–16.8 ms |
| Formatted report size | 470,639 bytes | 2,734,365 bytes | 10,575,167 bytes |

The large case spends roughly half its measured time constructing export evidence. Source inspection identifies repeated DOM selection, positional ancestry construction, sibling enumeration and computed-style/geometry reads as candidates for profiling. Measurements do not yet isolate each of those operations, so no individual operation is claimed as the proven bottleneck.

## Practical interpretation

Keep JSON and existing IndexedDB storage. These measurements do not justify introducing another storage engine or deleting passing-check evidence. Capture this baseline before changing export traversal or adding caches. Any optimization must preserve structural targets, evaluation scope, diagnostics and review/history semantics.

This does not replace the earlier report's recorded 16,438 ms scan or the unverified approximately 2–10 second application baseline. Simple synthetic pages exercise neither production complexity nor all interaction/media conditions.

## Limitations and remaining measurements

- Two measurements per size are a preliminary baseline, not production percentiles or a statistically controlled benchmark.
- Screenshot-backed/image/gradient contrast capture, viewport sweeps and real keyboard traversal are excluded. Their latency and correctness remain separate measurements.
- Supplementary snapshot collection is included in export time, rather than isolated.
- Node file-writing latency is not browser File System Access API latency or a durability guarantee.
- These timings include local preservation but not real browser permission prompts, selected-folder archival, or application login/navigation.
- The scratch files are synthetic, written under a newly created `test-results` subdirectory, then removed individually. The utility never deletes audit evidence.

Run again after relevant changes; compare equivalent environments and report all scope differences. Do not apply a hard timing pass/fail threshold based on this small baseline alone.
