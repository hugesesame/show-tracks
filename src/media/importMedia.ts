import { randomId, type MediaRecord } from '../model/types';
import { peaksFromBlob } from './peaks';

const AUDIO_EXTENSIONS = ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aif', 'aiff'];
const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];

export function mediaKind(file: File): MediaRecord['kind'] | null {
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return null;
}

/** Loads the metadata in a media element to check the browser can play it. */
function probeDuration(blob: Blob, kind: MediaRecord['kind']): Promise<number> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(blob);
    const done = () => {
      URL.revokeObjectURL(url);
      element.removeAttribute('src');
    };
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const { duration } = element;
      done();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error('Could not read the duration'));
    };
    element.onerror = () => {
      done();
      reject(new Error('This format cannot be played in this browser'));
    };
    element.src = url;
  });
}

export async function importMediaFile(file: File, expected: MediaRecord['kind']): Promise<MediaRecord> {
  const kind = mediaKind(file);
  if (kind !== expected) {
    throw new Error(expected === 'audio' ? 'Please choose an audio file' : 'Please choose a video file');
  }
  const duration = await probeDuration(file, kind);
  const peaks = (await peaksFromBlob(file)) ?? undefined;
  return {
    id: randomId(),
    kind,
    fileName: file.name,
    mimeType: file.type,
    blob: file,
    duration,
    peaks,
  };
}
