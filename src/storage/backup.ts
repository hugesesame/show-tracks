/** A backup is a folder: the project file and a media folder beside it. */
export const BACKUP_PROJECT_FILE = 'show-tracks.json';
export const BACKUP_MEDIA_DIR = 'media';

/**
 * File names for the media in a backup: the original names, with " (2)",
 * " (3)" … added before the extension when two different media share one.
 */
export function backupFileNames(media: { id: string; fileName: string }[]): Record<string, string> {
  const names: Record<string, string> = {};
  const taken = new Set<string>();
  for (const { id, fileName } of media) {
    const dot = fileName.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ''];
    let name = fileName;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
    taken.add(name.toLowerCase());
    names[id] = name;
  }
  return names;
}
