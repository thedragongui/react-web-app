export function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}

export function isImage(contentType?: string | null) {
  return !!contentType && contentType.startsWith('image/');
}

export function isPdf(contentType?: string | null) {
  return contentType === 'application/pdf';
}

export function formatBytes(bytes?: number | null) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
