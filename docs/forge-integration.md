# Forge produces native TutorialKit courses

`packages/forge` is a private Astro application using `@tutorialkit/astro` with its
standard generated lesson routes, content renderer, navigation, WorkspacePanel,
WebContainer commands, terminal, previews, and native Solve/Reset. It does not
route exercise execution or grading to Forge. The only component override wraps
the existing TopBar and adds a creation link and source-scoped mentor drawer.

## Run

From the TutorialKit repository, after installing the workspace and building its
packages:

```sh
FORGE_WORKTREE=/Users/max/dev/learning_forge-tutorialkit \
FORGE_URL=http://127.0.0.1:8876 \
pnpm --filter @forge/tutorialkit dev --port 4322
```

`FORGE_URL` selects the original Forge creation UI and the development `/api`
proxy. The source alias `@forge` reuses Forge's pure API and owner-session bootstrap
modules. A production server must provide the same-origin `/api` proxy and
WebContainer COOP/COEP headers; `astro preview` alone is not that production bridge.
TutorialKit's own integration installs development isolation headers.

`pnpm --filter @forge/tutorialkit build` builds native Astro pages. A fresh generated
export can be supplied as `FORGE_TUTORIAL_DIR=/path/to/export` for build or dev. The
sync script validates its manifest before replacing only that course's numbered
folder under `src/content/tutorial`; sibling courses are retained. A matching
previous public manifest is required before replacing an existing course folder. Do not point it
at owner course storage: its input is a separate native TutorialKit export.

## Producer contract

The export root contains native `meta.md`, numbered part/chapter/lesson folders,
`content.md`, `_files`, optional `_solution`, and `forge-manifest.json`. The default
Node template is supplied by the app. No native Python compatibility is assumed.
Only files intentionally public as TutorialKit learning/solution material belong
in this export; Forge internal authoring artifacts are not copied implicitly.

The manifest has `schema_version: 1`, a 64-character SHA-256 `course_digest`, and
`lessons`, keyed by the actual native URL path. Each lesson row carries
`course_slug`, `module_id`, `lesson_id`, `title`, and optional `assigned_evidence`
containing the original `{mentor_anchor, evidence_ref}` pairs. The mentor sends
only the selected lesson binding and displays server-authored probes or validated
responses. It does not create an alternate assessment system.

`/open?course=<slug>&module=<optional-module-id>` polls `/forge-courses.json`:

```json
{"courses":{"example":{"entry_path":"/example/first/lesson","digest":"<sha256>","manifest_path":"/forge-manifests/example.json"}}}
```

Each index row points to its own manifest; optional `routes` lists its native paths.
The mentor checks the index digest and exact route-to-course binding before using
provenance or saved edits. It opens the matching manifest module when requested, otherwise resumes a saved
lesson belonging to that manifest or opens the entry route. The optional single-export sync
script merges its course into this index. The launcher owns the automatic multi-course
watch/export process; normal builds without FORGE_TUTORIAL_DIR do not alter content. A supervising exporter can publish the index after its
native build is ready. External and protocol-relative redirect targets are rejected.

## Local edits and limits

The native TutorialStore snapshot and editor documents supply saved text. Browser
localStorage keys include the exported course digest and native lesson path. Restore
runs after native lesson loading and updates only files already editable in that
lesson through the existing TutorialStore API. Latest editor text overrides a
lagging WebContainer filesystem snapshot. Binary files and newly created files
outside the exported editable set are not restored. This is editor continuity,
not grading, completion, or mastery. Native Solve and Reset remain available.

The welcome JavaScript lesson works without a Forge course. Its mentor explains
that a generated course is needed. The application never substitutes a backend
Python runner for TutorialKit's runtime.

## Verification and source grounding

Seven focused persistence/manifest tests cover course ownership and stale digest
rejection as well as version/route isolation, the asynchronous
filesystem-write race, and rejecting unlisted file restoration. Native build and
visible browser runtime verification are performed by the coordinating agent.

The integration uses Astro's documented `vite` config passthrough and process.env
configuration: https://docs.astro.build/en/reference/configuration-reference/#vite
and https://docs.astro.build/en/guides/environment-variables/#in-the-astro-config-file
(consulted through Context7). Native component/store APIs were read at upstream
`80cb118647a45cc0dcef1f8018ebc0eef845c8eb`; the runtime singleton alias deliberately
resolves the same built module that WorkspacePanelWrapper imports.

The open page displays launcher `errors[course]` while retrying. A missing course
index permits only the bundled welcome manifest, never a stale exported course.
Mentor API compatibility follows the existing SSE final/probe contract, including
model-free probe re-sync after a lost response. Citations show the exact returned
quote, source corpus label, and evidence qualification; opaque anchor IDs are not
used as learner-facing source names.

Generated course folders, multi-course manifests and exported source copies are local runtime output and ignored here. Forge retains the tracked course and frozen sources; this app ships only its welcome lesson.

The native development API proxy validates mutating request Origin and Host against the
actual accepted loopback socket address/port before rewriting Origin to the dedicated
Forge target. Foreign, absent, null, different-port and spoofed-Host origins are rejected
with403 before proxying. Cookie and CSRF token checks remain Forge's responsibility and
the proxy preserves both headers unchanged. Native URLs use the literal loopback IP,
matching the launcher; forwarded headers and localhost aliases do not grant authority.
This is development proxy support, not a production/static-preview authentication layer.

Primary API grounding via Context7: Vite configureServer installs middleware before its
internal proxy (https://github.com/vitejs/vite/blob/v5.4.21/docs/guide/api-plugin.md);
server.proxy changeOrigin behavior (https://github.com/vitejs/vite/blob/v5.4.21/docs/config/server-options.md);
Node socket.localAddress/localPort identify the actual accepted server endpoint
(https://github.com/nodejs/node/blob/main/doc/api/net.md). A real ephemeral HTTP test
checks same-origin acceptance, foreign-origin rejection and cookie/CSRF preservation.

The checked-in lockfile includes the Forge workspace importer and the eight existing Astro
transitive resolution updates produced by pnpm8.15.6 during installation. Those resolutions
are retained to match the installation used for the native build and runtime checks.

Native development file-map requests recover from missed watcher events after atomic course
publication: only recognized files/solution/template JSON names are compared against
getFilesRef for canonical getAllFilesMap folders. The existing FilesMapCache generates
the result, retaining TutorialKit inheritance and serialization. No request becomes an
arbitrary disk path. A real temporary-directory regression adds a whole lesson after
server setup, exercises initial and inherited solution maps, and preserves existing maps.
