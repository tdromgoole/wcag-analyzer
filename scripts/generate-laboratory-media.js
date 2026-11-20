// Generate local synthetic shapes/tones only. No camera, microphone or files are read.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html lang="en"><title>Synthetic media generator</title><body></body></html>');
    const output = path.resolve(__dirname, '../laboratory/assets');
    await fs.mkdir(output, { recursive: true });
    for (const audio of [true, false]) {
      const bytes = await page.evaluate(async audio => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const context = canvas.getContext('2d');
        const draw = () => {
          context.fillStyle = '#dbeafe'; context.fillRect(0, 0, 320, 180);
          context.fillStyle = '#334155'; context.beginPath(); context.moveTo(10, 180); context.lineTo(125, 30); context.lineTo(240, 180); context.fill();
          context.fillStyle = '#b91c1c'; context.fillRect(245, 65, 40, 40);
        };
        draw();
        const video = canvas.captureStream(10);
        let audioContext;
        if (audio) {
          audioContext = new AudioContext(); await audioContext.resume();
          const destination = audioContext.createMediaStreamDestination();
          for (const offset of [0.15, 0.75]) {
            const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
            oscillator.frequency.value = 440; gain.gain.value = 0.12;
            oscillator.connect(gain); gain.connect(destination);
            oscillator.start(audioContext.currentTime + offset); oscillator.stop(audioContext.currentTime + offset + 0.2);
          }
          for (const track of destination.stream.getTracks()) video.addTrack(track);
        }
        const recorder = new MediaRecorder(video, { mimeType: audio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8' });
        const chunks = [];
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        const stopped = new Promise(resolve => { recorder.onstop = resolve; });
        const timer = setInterval(draw, 100);
        recorder.start(); await new Promise(resolve => setTimeout(resolve, 1500)); recorder.stop(); await stopped;
        clearInterval(timer); for (const track of video.getTracks()) track.stop(); if (audioContext) await audioContext.close();
        return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
      }, audio);
      const name = audio ? 'trail-warning.webm' : 'trail-silent.webm';
      await fs.writeFile(path.join(output, name), Buffer.from(bytes));
      console.log(`${name}: ${bytes.length} bytes; synthetic audio=${audio}`);
    }
  } finally { await browser.close(); }
})().catch(() => { console.error('Synthetic media generation failed.'); process.exitCode = 1; });
