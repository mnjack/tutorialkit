export function localPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}
export function normalizeRoute(path) { return path.replace(/\/$/, '') || '/'; }
export function lessonAt(manifest, pathname) {
  const path = normalizeRoute(pathname);
  return manifest.lessons?.[path] || manifest.lessons?.[`${path}/`];
}
export function validManifest(manifest, digest) {
  return manifest?.schema_version === 1 && /^[a-f0-9]{64}$/.test(manifest.course_digest)
    && (!digest || manifest.course_digest === digest) && manifest.lessons && typeof manifest.lessons === 'object';
}

export async function manifestForRoute(pathname, fetcher = fetch) {
  const indexResponse = await fetcher('/forge-courses.json', { cache: 'no-store' });
  if (!indexResponse.ok && indexResponse.status !== 404) throw new Error('Course index unavailable');
  const index = indexResponse.ok ? await indexResponse.json() : { courses: {} };
  const courses = Object.entries(index.courses || {});
  for (const [slug, entry] of courses) {
    if (Array.isArray(entry.routes) && !entry.routes.some((path) => normalizeRoute(path) === normalizeRoute(pathname))) continue;
    if (!localPath(entry.manifest_path)) continue;
    const response = await fetcher(entry.manifest_path, { cache: 'no-store' });
    if (!response.ok) continue;
    const manifest = await response.json();
    if (validManifest(manifest, entry.digest) && lessonAt(manifest, pathname)?.course_slug === slug) return manifest;
  }
  // Only the bundled welcome lesson uses the single manifest without a course row.
  if (!courses.length) {
    const response = await fetcher('/forge-manifest.json', { cache: 'no-store' });
    if (response.ok) {
      const manifest = await response.json();
      if (validManifest(manifest) && lessonAt(manifest, pathname)?.course_slug === '') return manifest;
    }
  }
  return null;
}
