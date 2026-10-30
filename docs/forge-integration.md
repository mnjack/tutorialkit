# Forge produces native TutorialKit courses

`packages/forge` is a private Astro application using `@tutorialkit/astro` with its
standard generated lesson routes, content renderer, navigation, WorkspacePanel,
WebContainer commands, terminal, previews, and native Solve/Reset. It does not
route exercise execution or grading to Forge. The only component override wraps
the existing TopBar and adds a creation link and source-scoped tutor drawer.

## Run

Install the workspace and build its packages once, from this repository:

```sh
CI=true HUSKY=0 npx pnpm@8.15.6 install
npx pnpm@8.15.6 run build
```

Then start Forge and this app together with the Learning Forge launcher, from the
Learning Forge checkout. On a work branch, or when an agent runs it, serve a scratch
copy of a scratch source folder, never `~/Documents/dev/forge-courses` or a copy of it:
that folder holds book courses, which stay there only (Learning Forge's D46, ADR-032).
The scratch source folder holds copies of `forge-courses`' `config.yaml` and
`trust_registry.yaml`, Learning Forge's `prompts/` and an empty `build/`:

```sh
scripts/tutorialkit-workbench --source-root ~/Documents/dev/forge-courses-scratch/<name>-source \
    --data-root ~/Documents/dev/forge-courses-scratch/<name>
```

The first run copies `--source-root` into `--data-root`, and later runs serve that copy.
On a work branch the launcher refuses any other folder, and refuses `forge-courses` as
`--source-root`. Run it with no arguments only from Learning Forge's `main`, where it
serves `~/Documents/dev/forge-courses` itself:

```sh
scripts/tutorialkit-workbench
```

It prints both addresses (usually `http://127.0.0.1:4322` for TutorialKit and
`http://127.0.0.1:8876` for Forge) and stops both on Ctrl-C. The launcher sets
`FORGE_WORKTREE` and `FORGE_URL` for this app. Without them, `FORGE_WORKTREE`
defaults to the `learning-forge` checkout beside this repository and `FORGE_URL`
to `http://127.0.0.1:8876`. A fork branch that imports Forge code not yet on Forge's
`main` (through `@forge`) builds only with `FORGE_WORKTREE` set to that Forge work
branch's checkout; merge the Forge side first, then the fork.

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
containing the original `{mentor_anchor, evidence_ref}` pairs. The tutor sends
only the selected lesson binding and displays server-authored probes or validated
responses. It does not create an alternate assessment system.

Lesson text arrives as the learner reads it (Learning Forge E2.2a, D43): Forge strips
every hidden marker and writes a `Source: ...` line under each quote, naming the real
source in plain words (a book title, a doc page and its link, a repo path, or an
uploaded file's original name). The tutor drawer shows each cited quote with only the
`citation` text Forge sent for it (`tutorReply.mjs`): no evidence badge, and no name of
its own when Forge sent none.
A link to another site, such as a citation's doc page or code lines, opens in a new
tab (`src/lib/externalLinks.mjs`, a remark plugin in `astro.config.ts`), so following it
never leaves the tutorial and its WebContainer session.

Rating buttons (Learning Forge D71, D81): each manifest lesson row lists the blocks a learner
rates on that page (`blocks`: each `##` section of a lesson and each quiz in it, with the index
of its section; or the whole page for a hands-on task or an exercise), and the manifest lists the
reason chips (`rating_reasons`). `Ratings.tsx` puts a quiet row under each block
(`ratingsPage.mjs` decides where: a section's row at its end or above its quiz, a quiz's row under
it, a whole-page row after the text): thumbs up and down, then the chips and an "Add a note" button
after a press (`ratingRow.mjs`). Each press saves at once through Forge's
`/api/courses/{slug}/ratings`, one request at a time in press order, each carrying the block's
whole rating so the latest press wins (`ratingSaves.mjs`); nothing pops up. The rows appear once
Forge has said what the learner already rated on the page, so a press always lands on the saved
chips and note. If Forge couldn't say, a press reads them again first and, when it still can't,
sends nothing and says on its row that it wasn't saved. "Add a note" moves
focus into the note box, and a typed note saves when the box loses focus (so a chip or thumb
pressed next saves it first) or on "Save note". The row's status line sits left of its label, so
"Saved." never moves the thumbs; a failed save shows Forge's own words only for its learner
refusals (404, 422) and otherwise "try again" or "open Forge". The note box clears anything
shaped like a key or token as it arrives (the hands-on key guard), and Forge refuses one too. If the page doesn't show exactly the sections Forge listed, every row goes after the text,
naming its block.

`/open?course=<slug>&module=<optional-module-id>` polls `/forge-courses.json`:

```json
{"courses":{"example":{"entry_path":"/example/first/lesson","digest":"<sha256>","manifest_path":"/forge-manifests/example.json"}}}
```

Each index row points to its own manifest; optional `routes` lists its native paths.
The tutor drawer checks the index digest and exact route-to-course binding before using
provenance or saved edits. When a course's `routes` lists the page but no valid manifest
binds it (a stale digest, or a manifest not yet written), the drawer says the course
metadata is unavailable and that saved edits and the tutor are disconnected. It opens the matching manifest module when requested, otherwise resumes a saved
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

The welcome JavaScript lesson works without a Forge course. Its content sets
`slug: welcome/start/lesson/content`, so it builds at `/welcome/start/lesson`, the
only key in the bundled `public/forge-manifest.json`. That manifest binds the page
whether or not courses are exported, so the welcome page keeps its edits. Its
tutor drawer says the page isn't part of a Forge course and shows no error. The
application never substitutes a backend Python runner for TutorialKit's runtime.

## Verification and source grounding

Focused persistence/manifest tests cover course ownership and stale digest
rejection as well as version/route isolation, the asynchronous
filesystem-write race, rejecting unlisted file restoration, the welcome binding
while courses are exported, the welcome route, and reporting a listed course route
without a valid manifest as unavailable. `drawerSession.test.mjs` drives the drawer's
page binding (`followLessonPages` in `drawerSession.mjs`) through in-app navigation: a
page whose workspace hasn't yet replaced the previous lesson in TutorialKit's store binds
nothing, so one lesson's edits never land in another's. It also checks the status line:
"Nothing to edit on this page" on a lesson with no editor (D59, `editing.mjs`), "Edits
saved in this browser" on a practice lesson, the disconnected message with its next step,
and that the line is a polite live region hidden while empty. `wording.test.mjs` keeps
"mentor" out of the drawer and its styles, except Forge's own API names. The build ends
with `scripts/check-build.mjs`, which fails unless every route in the bundled manifest
has a built page, no welcome page is built at a numbered folder path, and no built
file uses `forge-mentor`. Visible browser runtime verification is performed by the
coordinating agent.

The integration uses Astro's documented `vite` config passthrough and process.env
configuration: https://docs.astro.build/en/reference/configuration-reference/#vite
and https://docs.astro.build/en/guides/environment-variables/#in-the-astro-config-file
(consulted through Context7). Native component/store APIs were read at upstream
`80cb118647a45cc0dcef1f8018ebc0eef845c8eb`; the runtime singleton alias deliberately
resolves the same built module that WorkspacePanelWrapper imports.

The open page displays launcher `errors[course]` while retrying. The bundled welcome
manifest supplies only rows without a course slug, and never a route that an
exported course lists, so it cannot stand in for a stale exported course.
The tutor follows Forge's existing `/mentor` SSE final/probe contract, including
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
