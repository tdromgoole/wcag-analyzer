# Synthetic laboratory media

`trail-warning.webm` contains a canvas-rendered scene of mountain shapes and a warning sign, with two synthesized alert tones. `trail-silent.webm` contains the same visual scenario without an audio stream. Neither uses a camera, microphone, recorded speech, application content or third-party media.

Generate these assets with `node scripts/generate-laboratory-media.js`. The script uses headless Chrome, canvas, Web Audio and MediaRecorder. Encoded bytes can vary between generations; review regenerated fixtures and update the fixture version when behavior changes.

`captions.vtt` and `subtitles.vtt` are local synthetic test tracks. Their presence is an automated observation; human review of accuracy, timing and meaningful sound coverage remains unperformed. A subtitles label alone does not decide compliance. Silent-video non-applicability applies only to the relevant audio-caption requirement, not every multimedia criterion.
