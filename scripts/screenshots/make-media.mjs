// Makes the sample audio and video for the README screenshots into ./media:
// made up here rather than kept in the repo. The video needs ffmpeg.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const media = join(dirname(fileURLToPath(import.meta.url)), 'media');
mkdirSync(media, { recursive: true });

const RATE = 8000;

/** A mono 16-bit WAV of `seconds`, its loudness over time from `level(t)` (0..1). */
function wav(name, seconds, level) {
  const samples = Math.round(seconds * RATE);
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / RATE;
    const tone = Math.sin(2 * Math.PI * 220 * t) * 0.6 + Math.sin(2 * Math.PI * 330 * t) * 0.3 + (Math.random() - 0.5) * 0.2;
    data.writeInt16LE(Math.round(tone * level(t) * 26000), 44 + i * 2);
  }
  writeFileSync(join(media, name), data);
}

// Quiet verses, loud choruses and outro, fading out at the end: the waveform shows the song's shape.
const between = (t, a, b) => t >= a && t < b;
wav('song.wav', 90, (t) => {
  if (between(t, 30, 40) || between(t, 50, 60)) return 0.9;
  if (t >= 80) return 0.9 * Math.min(1, (90 - t) / 6);
  return 0.35;
});
wav('opening.wav', 150, (t) => 0.3 + 0.2 * Math.sin(t / 9));
wav('night-drive.wav', 200, (t) => (between(t, 120, 150) ? 0.85 : 0.4));

// A still orange-to-blue diagonal gradient for the video.
execFileSync('ffmpeg', [
  '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=0xf5a03c:c1=0x8a3cc8:c2=0x1e3fa0:n=3:x0=200:y0=0:x1=1080:y1=720:speed=0.00001:d=90:r=30',
  '-pix_fmt', 'yuv420p', '-c:v', 'libx264', join(media, 'video.mp4'),
]);
console.log(`Media written to ${media}`);
