import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The launcher owns automatic multi-course export/watch. This is manual import only.
const source = process.env.FORGE_TUTORIAL_DIR;
if (source) {
  const app = fileURLToPath(new URL('..', import.meta.url));
  const root = resolve(source);
  const manifest = JSON.parse(await readFile(resolve(root, 'forge-manifest.json'), 'utf8'));
  if (manifest.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.course_digest)
      || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.course_slug) || !Object.keys(manifest.lessons || {}).length) {
    throw new Error('The Forge export needs a versioned course manifest.');
  }
  await readFile(resolve(root, 'meta.md'));
  const folders = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (folders.length !== 1 || !folders[0].name.endsWith(`-${manifest.course_slug}`)) {
    throw new Error('A manual export must contain one numbered course folder matching its slug.');
  }
  const publicRoot = resolve(app, 'public');
  const manifestPath = resolve(publicRoot, 'forge-manifests', `${manifest.course_slug}.json`);
  let prior;
  try { prior = JSON.parse(await readFile(manifestPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const destination = resolve(app, 'src/content/tutorial', folders[0].name);
  if (root === destination || root.startsWith(destination + '/')) throw new Error('Use a separate Forge export directory.');
  const existing = (await readdir(resolve(app, 'src/content/tutorial'))).includes(folders[0].name);
  if (existing && prior?.course_slug !== manifest.course_slug) throw new Error('Refusing to replace native content without its matching course manifest.');
  // Replace only this explicitly selected generated course; retain all sibling courses.
  if (existing) await rm(destination, { recursive: true });
  await cp(resolve(root, folders[0].name), destination, { recursive: true });
  await mkdir(resolve(publicRoot, 'forge-manifests'), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  let index = { courses: {} };
  try { index = JSON.parse(await readFile(resolve(publicRoot, 'forge-courses.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const routes = Object.keys(manifest.lessons);
  index.courses[manifest.course_slug] = { entry_path: routes[0], digest: manifest.course_digest,
    manifest_path: `/forge-manifests/${manifest.course_slug}.json`, routes };
  await writeFile(resolve(publicRoot, 'forge-courses.json'), JSON.stringify(index, null, 2));
}
