export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const initials = (n?: string | null) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
export function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
}
export const fileExt = (name: string) => (name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
export function privateStoragePath(value: string | null | undefined, bucket: string) {
  if (!value) return null;
  const marker = `/object/public/${bucket}/`;
  const signedMarker = `/object/sign/${bucket}/`;
  const markerIndex = value.indexOf(marker);
  const signedIndex = value.indexOf(signedMarker);
  const index = markerIndex >= 0 ? markerIndex + marker.length : signedIndex >= 0 ? signedIndex + signedMarker.length : -1;
  if (index >= 0) {
    try { return decodeURIComponent(value.slice(index).split('?')[0]); }
    catch { return null; }
  }
  if (!/^https?:\/\//i.test(value)) return value;
  return null;
}
