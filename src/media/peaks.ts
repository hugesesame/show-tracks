export const PEAK_PAIRS_PER_SECOND = 100;

/** Interleaved [min, max] per bucket, taken across all channels. */
export function computePeaks(channels: Float32Array[], sampleRate: number): Float32Array {
  const length = channels[0]?.length ?? 0;
  const bucketSize = Math.max(1, Math.round(sampleRate / PEAK_PAIRS_PER_SECOND));
  const buckets = Math.ceil(length / bucketSize);
  const peaks = new Float32Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    let min = 0;
    let max = 0;
    const end = Math.min(length, (b + 1) * bucketSize);
    for (const data of channels) {
      for (let i = b * bucketSize; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }
  return peaks;
}

/**
 * Decodes the file once to build its waveform, then lets the decoded data go.
 * Returns null if the file has no decodable audio (e.g. a silent video).
 */
export async function peaksFromBlob(blob: Blob): Promise<Float32Array | null> {
  // An OfflineAudioContext can decode without needing an output device.
  const context = new OfflineAudioContext(1, 1, 44100);
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return computePeaks(channels, buffer.sampleRate);
  } catch {
    return null;
  }
}
