export function localPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}
export function normalizeRoute(path) { return path.replace(/\/$/, '') || '/'; }
export function lessonAt(manifest, pathname) {
  const path = normalizeRoute(pathname);
  return manifest?.lessons?.[path] || manifest?.lessons?.[`${path}/`];
}
export function validManifest(manifest, digest) {
  return manifest?.schema_version === 1 && /^[a-f0-9]{64}$/.test(manifest.course_digest)
    && (!digest || manifest.course_digest === digest) && manifest.lessons && typeof manifest.lessons === 'object';
}

// Returns the manifest that binds this route, or null. When an exported course
// lists the route but no valid manifest binds it, it also calls onUnavailable:
// the page belongs to a course whose metadata is missing or stale, so it is not
// a page outside every course.
export async function manifestForRoute(pathname, fetcher = fetch, onUnavailable = () => {}) {
  const indexResponse = await fetcher('/forge-courses.json', { cache: 'no-store' });
  if (!indexResponse.ok && indexResponse.status !== 404) throw new Error('Course index unavailable');
  const index = indexResponse.ok ? await indexResponse.json() : { courses: {} };
  const courses = Object.entries(index.courses || {});
  const route = normalizeRoute(pathname);
  let claimed = false;
  for (const [slug, entry] of courses) {
    if (Array.isArray(entry.routes)) {
      if (!entry.routes.some((path) => normalizeRoute(path) === route)) continue;
      claimed = true;
    }
    if (!localPath(entry.manifest_path)) continue;
    const response = await fetcher(entry.manifest_path, { cache: 'no-store' });
    if (!response.ok) continue;
    const manifest = await response.json();
    if (validManifest(manifest, entry.digest) && lessonAt(manifest, pathname)?.course_slug === slug) return manifest;
  }
  // The bundled welcome lesson belongs to no course. Its manifest covers only
  // rows without a course slug, and never a route an exported course lists.
  if (claimed) {
    onUnavailable();
    return null;
  }
  const response = await fetcher('/forge-manifest.json', { cache: 'no-store' });
  if (response.ok) {
    const manifest = await response.json();
    if (validManifest(manifest) && lessonAt(manifest, pathname)?.course_slug === '') return manifest;
  }
  return null;
}
