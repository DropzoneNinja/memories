# Memories — Task List

Working checklist for building Memories, derived from `PROJECT.md`
(section references in parentheses point back to the spec for full detail).
Check items off with `[x]` as they're completed. `[~]` marks a task
that's infrastructure-ready but not actually, fully done — used sparingly,
only for something that genuinely can't be completed by writing code
(e.g. a real-time observation task still pending). Phases are ordered —
each one assumes the previous is basically working — but within a phase,
order tasks however makes sense during the build.

Legend: **API** = Memories API, **Web** = Memories Web, **TV** = Memories
TV (Tizen client).

---

## Phase 0 — Project & Infra Setup ✅ complete

Only the lint/CI item below remains, and it's low priority — everything
load-bearing for Phase 1 (repo, Compose stack, and the full Tizen
build/sign/install/launch toolchain) is done and confirmed working on
real hardware.

- [x] Create monorepo layout (`api/`, `web/`, `tv/`, root `docker-compose.yml`)
- [x] Initialize git repo; `.gitignore` covering secrets, `node_modules`,
      build output, and Tizen packaging artifacts — repo initialized,
      nothing committed yet (left for the user to review/commit)
- [x] Choose backend language/framework for the Memories API (was open in
      §10) and scaffold it — **Node.js + TypeScript + Fastify + Prisma**,
      chosen for stack consistency with Web/TV. Scaffolded, type-checks,
      and boots against real Postgres (verified both via `npx tsx` locally
      and as the built Docker image) (§10)
- [x] Root `docker-compose.yml` skeleton with `api`, `web`, `postgres`
      services (§10) — no Kubernetes, no managed DB. Verified with a real
      `docker compose up`: all three containers healthy, `api` serves
      `/healthz` -> `200 {"status":"ok"}` against the containerized
      Postgres, `web` serves its production build on `:5173`
- [x] `.env.example` covering Postgres credentials, Immich URL/API key
      placeholder, session/JWT secret — never commit real values
- [x] Confirm network reachability to the TV — originally verified across
      the IoT VLAN (`10.10.40.21`), but the TV was later moved to
      `10.10.10.80` (same subnet as the dev Mac) after discovering
      Tizen's `sdb` debug port gets refused across that VLAN boundary
      specifically (see PROJECT.md §2/§12). Confirmed reachable at its
      current address.
- [x] Set up Postgres migration tooling — Prisma Migrate wired up; initial
      migration (`init`) generated and applied successfully against a real
      Postgres container
- [x] Scaffold Tizen `config.xml` with a package identifier — **correction
      from the original plan**: Tizen's `tizen:application package`
      attribute must be exactly 10 alphanumeric characters, so
      `zone.wreck.memories` isn't valid there. Used `package="zwreckmemo"`
      / `id="zwreckmemo.Memories"` for the real Tizen identifiers, and put
      the full domain in the cosmetic `widget id="http://zone.wreck/memories"`
      instead. See PROJECT.md §10. **Not yet validated against Tizen
      Studio's actual tooling** — do that before the first signed build.
- [x] Install/verify Tizen tooling on the Mac dev machine — **plan
      changed mid-Phase-0**: attempted the classic Tizen Studio CLI
      installer first, but the actual bug hit was the installer wanting an
      interactive Y/n prompt even with `--accept-license` (non-fatal,
      just not scriptable this way) — before pushing further the user
      flagged that Tizen Studio's Emulator/toolchain isn't supported on
      Apple Silicon as of 6.x and is deprecated in favour of editor
      extensions anyway, so switched approach. Installed the official
      **"Tizen TV" VS Code extension** (`tizensdk.tizentv` v1.3.3,
      Samsung/vscode-extension-tizentv on GitHub) into VSCodium instead —
      sideloaded as a `.vsix` from the Microsoft Marketplace since it
      isn't published to Open VSX. Confirmed installed
      (`codium --list-extensions`) and confirmed it's self-contained (own
      bundled cert manager + on-demand `sdb` download, no separate Tizen
      Studio needed). See PROJECT.md §10 for the full correction.
- [x] "Hello world" build smoke test — `tv/` builds a packageable `dist/`
      (moved `config.xml` and a placeholder `icon.png` into `tv/public/`
      so Vite copies them into `dist/` automatically). **Fully packaged,
      signed, installed, and launched on the real TV** — confirmed
      visually on screen. See "Build/sign/install" section below.
- [x] Enable Developer Mode on the physical TV (`QA32LS03CBWXXY`) — done.
      Smart Hub → Apps → App Settings → `12345` → toggle On → host PC IP
      → reboot. Confirmed "Develop Mode" showing on the Apps screen.
- [ ] Basic lint/format/CI wiring for `api/`, `web/`, and `tv/` — not done;
      deferred, low priority

### Build/sign/install: fully scripted, no VSCodium UI needed

Turned out the extension's certificate/build/launch logic is plain
Node with zero `vscode` dependency, published to npm as
`@tizentv/webide-common-tizentv` + `@tizentv/tools` (same versions the
extension bundles). Added as real `tv/` devDependencies and driven from
`tv/scripts/deploy.cjs`:

```
cd tv
npm run build            # vite build -> tv/dist
npm run deploy [tvIp]     # creates/reuses cert profile, signs, installs, launches
                           # defaults to $MEMORIES_TV_IP or 10.10.10.80
```

Along the way:

- **TV moved networks**: `sdb` (port 26101) was being refused across the
  IoT VLAN boundary even though other TV ports (8001/8080/9197) worked
  fine cross-VLAN — an `sdbd`-specific restriction, not a general
  firewall issue. TV is now at `10.10.10.80` on the same subnet as the
  dev Mac. See PROJECT.md §2/§12 — whether it moves back to the IoT VLAN
  once development winds down is still open.
- **Fixed a real bug**: the tools' default "sdk-public" distributor
  certificate expired 2022-10-27. Samsung ships renewed `-new` files
  alongside the stale ones in the same download; `deploy.cjs` uses those.
- **Found the actual remaining blocker, now resolved**: real Samsung TVs
  reject installs signed with only the generic Tizen SDK sample
  distributor cert (`Check certificate error: Invalid certificate
  chain...`) — they require a **Samsung-issued, device-ID-linked
  distributor certificate** from a Samsung Account. User installed
  Samsung's newer "Tizen Extension" for VS Code and ran its Certificate
  Manager (real Samsung Account login, registered `QA32LS03CBWXXY`'s
  device ID `SHCLFXOSLCSYC`), producing `author.p12` + `distributor.p12`
  under `~/SamsungCertificate/`. Along the way, found and worked around
  another real bug: the library's macOS keychain command
  (`security add-generic-password -a ${pwdFile}`) doesn't quote that
  argument, so a cert path containing a space breaks it — copied the
  certs to a no-space path as the fix (`tv/scripts/
  import-samsung-cert.cjs`). Registered as the `home-development` profile
  and activated.
- **Confirmed working end-to-end on real hardware**: `npm run build &&
  npm run deploy 10.10.10.80` → `sdb` reports `install completed` →
  `execute` reports `successfully launched` → **user confirmed the
  placeholder text is actually showing on the TV screen.** Phase 0 is
  fully done — the whole toolchain (build, sign, install, launch) is
  proven and scripted, no manual/GUI steps required for future builds.

## Phase 1 — TV Shell ✅ complete

Confirmed on real hardware: screen size detected correctly (1920×1080),
Left/Right remote keys cycle between mock images with a crossfade, and
contain-fit rendering verified unambiguously with a bordered/corner-
marked test image (visible mat bars, no cropping, no stretching).

*(Milestone 1, §11.2 — installable app, remote input, mock rendering)*

- [x] Scaffold the Tizen Web Application (`tv/`) — done in Phase 0
      (TypeScript, Vite, no framework)
- [x] Implement a `TizenAdapter` module isolating remote-key handling, app
      lifecycle, and device info behind one boundary (§10, §15.4) — done
      in Phase 0; key names verified against Samsung's official remote
      control docs (Back/Enter/arrows are mandatory and need no
      registration; MediaPlayPause/MediaTrackNext/MediaTrackPrevious are
      registered explicitly) — no changes needed
- [x] Implement a basic full-screen renderer showing a single static/mock
      image — `tv/src/render/ImageStage.ts`: contain-fit (never crop,
      never stretch, §5.2), centered on a mat background, with a simple
      opacity crossfade between images (§5.5). Two generated mock photos
      (`tv/public/mock/sample-0{1,2}.png`, one landscape 3:2, one
      portrait 2:3 — deliberately not 16:9, to actually exercise
      letterboxing/pillarboxing)
- [x] Implement remote key handling: Up/Down/Left/Right, Enter/Select,
      Back/Return, Play/Pause, Next/Previous (§8) — Left/Right and
      Previous/Next cycle between the two mock images with a crossfade,
      wired in `tv/src/main.ts`
- [x] Implement automatic screen-dimension detection — no hardcoded
      resolution assumptions (§9.1, §9.13) — `tv/src/render/ScreenInfo.ts`
      reads the real viewport size (accurate on-device since the app runs
      full-viewport) with a 1920×1080 fallback
- [x] Package, sign, and install the app on the real TV via Developer
      Mode — `npm run deploy` (Phase 0 tooling), confirmed working
- [x] Verify remote navigation and full-screen rendering on real
      hardware — build/install/launch confirmed via `sdb` ("install
      completed" / "successfully launched"); added a temporary on-screen
      debug readout (resolution + last key pressed) in the bottom-left
      corner specifically so this is easy to verify visually on the TV —
      **remove this readout before Phase 8 hardening** (PROJECT.md §5.7:
      no persistent chrome in the finished app). Physical remote-button
      testing on the actual TV still needs the user to confirm.
- [x] Set up a browser-based dev loop for the TV app so most iteration
      doesn't require a physical deploy (§10, §15.4) — `npm run dev`
      (Vite dev server); `TizenAdapter` falls back to keyboard arrow
      keys/Enter when `window.tizen` isn't present, so the same code path
      is testable in a normal browser

## Phase 2 — Memories API Skeleton + Immich Integration ✅ complete

*(Milestone 2, §11.2)*

- [x] Scaffold the Memories API service, wired into `docker-compose.yml`
      — done in Phase 0
- [x] Implement Postgres schema: `users`, `tvs`, `configurations`
      (versioned), synced `albums`, `presentations`/queue items,
      `commands`, `audit_log` (§7) — done in Phase 0
- [x] Store the Immich API key securely (env/secret store) — never
      logged, never in source control, never exposed to any UI (§7,
      §9.15, §13) — `.env` (gitignored), read only by
      `api/src/immich/config.ts`, never returned in any API response
- [x] Implement an `ImmichClient` module: auth, list albums, list album
      assets, fetch thumbnails/previews (§6, §10) — verified against the
      official OpenAPI spec (`immich-app/immich`, not assumed) *and*
      cross-checked against the real running instance, which caught a
      real spec/reality mismatch (see PROJECT.md §10 for the
      `width`/`height` discrepancy). `api/src/immich/ImmichClient.ts` +
      `types.ts`; routes in `api/src/routes/albums.ts`
      (`GET /api/v1/albums`, `GET /api/v1/albums/:id/assets`,
      `GET /api/v1/assets/:id/thumbnail`)
- [x] Confirm real network connectivity from the lab Docker host to the
      Immich instance — hit a real blocker along the way: Alpine's musl
      libc DNS bug broke `fetch()` to the Immich hostname from inside the
      container (see PROJECT.md §10). Switched `api/Dockerfile` to
      `node:20-slim`, confirmed fixed, then confirmed real end-to-end
      connectivity through the full `docker-compose up` stack
- [x] Document the minimum-permission Immich API key setup — confirmed
      exact scope names via the spec's `x-immich-permission` annotations:
      `album.read`, `asset.read`, `asset.view` (PROJECT.md §10)
- [x] Integration tests: Immich auth, album retrieval, asset retrieval,
      image download (§11.1) — `api/src/immich/ImmichClient.integration.test.ts`
      (`npm test` in `api/`, uses Node's built-in test runner, skips
      gracefully without credentials configured), passing against the
      real instance (4/4)
- [x] `docker-compose up` brings up the full stack and the API can list
      real albums from the real Immich instance — confirmed: real
      "Memories" album (58 assets, 49 images + 9 videos) returned via
      `/api/v1/albums`, full EXIF via `/api/v1/albums/:id/assets`, a real
      thumbnail streamed via `/api/v1/assets/:id/thumbnail`

Note for later phases: albums can contain videos — composition/queue
generation (Phase 4) needs to filter to `type === 'IMAGE'` only.

## Phase 3 — TV ↔ API Integration ✅ complete

*(Milestone 3, §11.2)*

- [x] Implement TV-side pairing: generate/display a short numeric pairing
      code on first launch (§5.9) — `tv/src/pairing/PairingScreen.ts`,
      device id generated + persisted in `localStorage`
      (`tv/src/device/DeviceId.ts`)
- [x] Implement API pairing endpoints: create a pending code, complete
      pairing from the dashboard, associate the device with a named TV
      record — `api/src/routes/tvs.ts`
      (`POST /api/v1/tvs/pairing`, `POST /api/v1/tvs/pairing/complete`),
      exercised via curl since Memories Web doesn't exist yet (Phase 6)
- [x] Implement `GET /api/v1/tvs/{deviceId}/playlist` returning real
      Presentation objects (§5.1, §7) — deliberately the simplest valid
      shape (single image, flat mat, no framing) since composition
      (Phase 4) and colour theory (Phase 5) aren't built yet; queue is
      materialized once per config change (`api/src/playlist/queue.ts`,
      `presentation.ts`) rather than hitting Immich on every poll
- [x] Implement the TV-side playlist consumer that requests more items as
      its local queue is consumed — `tv/src/playback/PlaybackController.ts`
- [x] Implement the TV-side Presentation renderer (single-image case
      first): layout, mat/background, frame, transition, asset (§5.1) —
      `tv/src/render/PresentationRenderer.ts`, wraps the Phase 1
      `ImageStage`
- [x] Implement heartbeat/status reporting (`POST /tvs/{deviceId}/heartbeat`)
      — every 30s from the TV
- [x] Implement the command queue — `POST /tvs/{id}/commands` for
      next/previous/pause/resume — and TV-side polling/consumption of it
      (§7, §8) — TV polls every 5s, marks delivered on fetch
- [x] End-to-end check: pair the real TV, assign a real Immich album, see
      real photos render on screen — **confirmed by the user**: paired,
      configured with the real "Memories" album, cycled through ~20 real
      photos via the physical remote's Left/Right, crossfade working

### Two real bugs found and fixed

1. **Tizen silently blocks all outbound `fetch`/XHR by default.** The TV
   made zero network requests at all — not even a failed one — until
   `<access origin="*" subdomains="true"/>` was added to `config.xml`.
   Tizen's WAC-style access whitelist has nothing to do with the
   `internet` privilege (which we already had); without an explicit
   `<access>` element it defaults to same-origin-only, and unlike a
   browser's CORS block this doesn't even attempt the request. Costly to
   miss since it fails *silently* — worth remembering for any future
   Tizen network call.
2. **Race condition: playlist requested before queue regeneration
   finished.** `PUT .../config` triggers `regenerateQueue()` (calls
   Immich, can take a few seconds); if the TV's pairing-detection poll
   and playlist fetch land in that window, it gets a valid-but-empty
   playlist and — originally — just silently stalled forever with no
   retry. Fixed in `PlaybackController.start()`: retries every 3s (up to
   10 attempts) if the queue comes back empty, and now shows an
   informative status either way instead of freezing on stale text.
   Reproduced live during testing, not just theoretical.

### Dev-workflow note

Uninstalling the app (which `deploy.cjs` does before every reinstall)
wipes its `localStorage`, so **every fresh deploy generates a new device
id and needs re-pairing** — observed directly during this phase. Fine for
now (re-pairing takes seconds via curl); worth revisiting if it gets
tedious once Phase 6's real dashboard exists (e.g. an upgrade-in-place
install path instead of uninstall-then-install, if `sdb`/Tizen supports
one).

## Phase 4 — Composition Engine (server-side) ✅ complete

*(Milestone 4, §5.2)*

New independent module `api/src/composition/` — `orientation.ts`
(aspect-ratio/EXIF-rotation classification) and `group.ts` (deterministic
grouping into `single` / `two-portrait` / `three-portrait` compositions),
covered by 26 unit tests (`orientation.test.ts`, `group.test.ts`). Wired
into `regenerateQueue` (`api/src/playlist/queue.ts`): images are grouped
*after* shuffle/sequential ordering is decided, so one `QueueItem` is now
one composition (1-3 images), not one image. `presentation.ts`'s
`Presentation`/`Layout` types generalized from a hardcoded single-slot
tuple to `{ type, slots: [] }` + `assets: []` to carry 1-3 images.

- [x] Design the composition data model (layout types: single,
      two-portrait, three-portrait; slots/positions) — `CompositionGroup`/
      `LayoutType`/`SlotPosition` in `composition/group.ts`, mirrored into
      `Presentation`'s `layout`/`assets` shape
- [x] Implement aspect-ratio/orientation classification for assets —
      `composition/orientation.ts`: `classifyOrientation` returns
      `landscape` / `portrait` / `square`, correctly swapping width/height
      for EXIF orientation 5-8 (90° rotations) before computing the ratio
      — verified against real iPhone EXIF (orientation `6`, stored
      4032×3024) in end-to-end testing, not just assumed
- [x] Implement layout selection: single landscape, 1/2/3-up portrait
      grouping — `preferredGroupSize` buckets a portrait's ratio into
      1/2/3 based on narrowness
- [x] Implement mixed-orientation grouping (landscape alone, portrait
      pairs/triples) rather than one-image-at-a-time regardless of shape
      — `groupForComposition` breaks the ordered image list into
      landscape/square singles and portrait runs, packing each run via
      `packPortraitRun`
- [x] Guarantee determinism — same album/ordering/settings always
      produces the same grouping — pure functions over the already-ordered
      array, no randomness of their own; covered by an explicit test
- [x] Handle edge cases explicitly: single-image albums, all-landscape,
      all-portrait, square/panoramic/very small images, remainder groups
      of 1/2/3 portraits at the end of a pass — all covered by unit tests;
      square bucketed with landscape (shown alone) since PROJECT.md
      doesn't prescribe which bucket it belongs to — documented in
      `orientation.ts`; missing/zero/negative dimensions fall back to
      landscape rather than erroring
- [x] Ensure two landscapes are never auto-paired unless genuinely
      complementary — this engine doesn't implement the "complementary"
      exception, so landscapes (and squares) are always singleton groups,
      which trivially satisfies "never auto-paired" and also keeps the
      layout model to exactly the three types PROJECT.md names
- [x] Unit tests covering every edge case above (§11.1) — 26 tests total
      across `orientation.test.ts` and `group.test.ts`, all passing
- [x] Wire the composition engine into playlist generation so `/playlist`
      returns real multi-image compositions, not just single images —
      confirmed against the real Immich "Memories" album (49 images) via
      `docker compose` + curl: real two-portrait groupings returned with
      correct filenames/EXIF per slot (see below)

### Real-data calibration bug, found and fixed before merging

The first version of `preferredGroupSize`'s thresholds (tuned on made-up
numbers) classified a 0.75 aspect ratio as "show alone." Tested against
the real running stack (`docker compose build/up`, then curling
`/playlist` for the real 49-image "Memories" album) rather than trusting
the unit tests alone — and every single real photo came back as a
`single` layout, zero pairs. Root cause: **iPhone photos are stored at
4032×3024 with EXIF orientation `6`** (needs a 90° rotation to display
upright), so the *displayed* ratio is 3024/4032 = **0.75**, which is by
far the most common real-world portrait shape — and the original
threshold only started pairing below 0.72. Recalibrated to 0.6/0.85
(0.75 and the classic DSLR 2:3 = 0.667 both now pair; only ≤0.6 triples),
rebuilt, redeployed, and reconfirmed against the same real album: 15
two-portrait groups + 19 singles from 49 images, matching what the photos
actually are. Added a regression test (`group.test.ts`, "real iPhone
portrait dimensions") using the literal 4032×3024/orientation-6 shape so
this can't silently regress. Worth remembering generally: aspect-ratio
heuristics tuned on invented numbers need checking against real EXIF
before they mean anything.

### TV-side rendering (pulled forward from the Phase 3 stub)

`PresentationRenderer`/`ImageStage` (`tv/src/render/`) only ever rendered
`presentation.assets[0]` — fine while every Presentation was single-image,
but it would have silently dropped 2 of every 3 images in a composition
group once the engine above started producing them. Since Phase 5's
faux-3D framing task explicitly builds *on top of* multi-slot rendering,
extended `ImageStage.show()` to take an array of image URLs and lay them
out as equal-width flex slots (each independently contain-fit, small gap
between, no per-slot framing yet — that's Phase 5), and
`PresentationRenderer` now resolves every `layout.slots` entry (by
`assetId`, not by array position) instead of just the first asset. Mat
colour/frame are still the Phase 3 placeholder flat values — real
colour-theory mats are Phase 5.

- [x] Redeployed the built app to the real TV (`npm run deploy`, real
      `sdb` install+launch, confirmed via `sdb`'s own success output) —
      this uninstalls first (known Phase 3 behaviour), so it re-paired
      with a fresh device id via curl same as prior phases
- [x] Confirmed via the API that the redeployed TV is actively polling
      `/playlist` and advancing through real two-portrait/single
      compositions from the real album (`lastServedPosition` advancing)
- [x] **Confirmed by the user on the physical TV**: both `two-portrait`
      and `single` compositions render correctly — two photos side by
      side with no distortion/cropping, and single images as before

### Addendum: never show a lone portrait (user-reported, post-launch)

User caught it from actually watching the real slideshow: "a couple of
single portrait images" were showing up alone. The original design
(PROJECT.md §5.2, pre-correction) had *two* independent sources of a
lone-portrait composition, both considered intentional at the time:
`preferredGroupSize`'s `ratio > 0.85 → 1` branch (a wide/near-square
portrait "looks better alone" than squeezed into a half-width slot), and
an uneven run remainder (e.g. 5 narrow portraits packing greedily as
2+2+1). The user's correction overrides both: a lone portrait is now
**never** an acceptable composition, full stop.

- [x] `preferredGroupSize` (`api/src/composition/group.ts`) floored at
      2 — the `→ 1` branch is gone entirely, so no aspect ratio ever
      classifies a portrait as "better alone"
- [x] `packPortraitRun` reworked: computes a run's group sizes up front,
      then if the trailing size is 1 (only possible now as a genuine
      remainder, e.g. 3+1 or 2+2+1), folds it into the previous group
      (2→3) when there's room, or reflows (3+1 → 2+2) when the previous
      group is already full — a dangling remainder is never emitted as
      its own group
- [x] `groupForComposition` handles the case `packPortraitRun` can't fix
      on its own: a portrait run of length exactly 1 (no neighbouring
      portrait at all, e.g. sandwiched between two landscapes). Never
      shown alone: merged with the next image if one exists (keeps
      chronological order forward), else grown into the immediately
      preceding group (up to the 3-up cap) if there's room. Only a
      single-image album (literally nothing else to pair with) still
      shows one photo alone — unavoidable, same as it always was
      regardless of orientation
- [x] 10 new/rewritten unit tests in `group.test.ts` covering: both
      remainder-reflow shapes, wide-portraits-paired (not alone), forward
      merge (isolated portrait at album start), backward merge (isolated
      portrait at album end), two consecutive isolated portraits both
      getting absorbed (none stranded), the true single-image-album
      fallback, and a general "no composition in a realistic mixed album
      is ever a lone portrait" property test — 86/86 tests passing
- [x] **Verified against the real stack**: rebuilt/redeployed the API
      container, re-saved the live "Lounge" TV's config unchanged (just to
      trigger `regenerateQueue` against the fixed engine), then
      cross-checked the regenerated queue against the real album's own
      EXIF (fetched independently via `GET /albums/:id/assets`, orientation
      computed the same way `classifyOrientation` does) rather than trusting
      layout labels alone. Real 100-photo album, 28 composed slides (12
      `single`, 2 `two-portrait`, 14 `collage` at the user's chosen
      `collageFrequency: 2`): zero lone-portrait violations — every
      `single` composition's photo confirmed landscape by its real EXIF
      dimensions, every portrait appears only inside a 2+ composition

## Phase 5 — Colour & Mat Engine + Faux 3D Framing ✅ complete

*(Milestone 5, §5.3, §5.4)*

New independent module `api/src/colour/`: `oklch.ts` (OKLCH/OKLab
conversion + a perceptually-correct multi-colour average), `dominantColour.ts`
(sharp decode + deterministic k-means clustering in OKLab), `cache.ts`
(the `AssetColourAnalysis` cache, injected-store design for testability),
`matCandidates.ts` (8-candidate generation), `matScoring.ts` (auto-select
scoring), `matMode.ts` (the 11 `MatMode` values, including the three fixed
neutrals). 50 new unit tests across all six files (76 total in `api/`,
all passing). Wired into `regenerateQueue`: each composition's images are
analysed (cache-checked first), combined into one composition-level
dominant colour, and resolved through the TV's configured `MatMode` into
the real `background.colour` — replacing Phase 3's flat placeholder.
`frame` is now `{ shadow: 'subtle', bevel: 'inner' }` (previously
`'none'/'none'`), and the TV renderer (`tv/src/render/ImageStage.ts`)
actually draws that: a soft outer shadow + inner-edge highlight per
photo, plus a faint radial-gradient vignette on the mat itself.

- [x] Implement dominant/representative colour extraction per image and
      per composition — `colour/dominantColour.ts` (per image, via k-means
      in OKLab) + `oklch.ts`'s `combineOklch` (per composition: a
      perceptually-correct Cartesian average across all of a group's
      images, not just the first one)
- [x] Implement OKLCH/Lab colour-space utilities (not raw RGB arithmetic)
      — `colour/oklch.ts`, Björn Ottosson's published conversion
      matrices, round-trip tested against 8 reference colours
- [x] Implement mat-candidate generation (5–8 candidates: complementary,
      analogous, muted variants, warm/cool neutral, near-white/near-black)
      — `colour/matCandidates.ts`, always exactly 8, dropping whichever
      of near-white/near-black would contrast least with the specific
      photo
- [x] Implement the mat scoring function (contrast, harmony, luminance,
      saturation, readability) and auto-selection — `colour/matScoring.ts`;
      AUTOMATIC mode only, the named override modes below bypass scoring
      on purpose
- [x] Cache colour-analysis results by asset ID/hash — never re-analyse
      the same image twice (§5.3) — new `AssetColourAnalysis` Prisma
      model + `colour/cache.ts`; **confirmed against the real stack**: a
      second queue regeneration for the same 49-image album ran in
      ~0.19s vs ~2s cold, produced byte-identical mat colours, and left
      the cache table at exactly 49 rows (no re-analysis, no duplicates)
- [x] Implement manual override modes (Automatic / Neutral / Warm / Cool
      / Dark / Light / Complementary / Analogous + fixed white/black/wood),
      persisted per TV — `MatMode` enum extended with `WHITE`/`BLACK`/
      `WOOD` (migration `20260903151743_colour_engine`; these three were
      in PROJECT.md §5.3 but missing from the Phase 0/2 schema and the
      config-PUT zod validator); `colour/matMode.ts` resolves all 11.
      **Verified against a real photo**: all 11 modes produced correct,
      visually distinct results (e.g. `WOOD` → `#66442c`, a real walnut
      brown; `WHITE`/`BLACK`/`WOOD` confirmed identical regardless of
      which photo, per their "fixed" contract)
- [x] Implement faux-3D framing on the TV renderer: subtle inner/outer
      shadow, inner-edge highlight, faint tonal gradient — kept
      extremely restrained (§5.4) — `tv/src/render/ImageStage.ts`, driven
      by the server's `frame` field (the TV still never invents its own
      styling, §5.1) rather than hardcoded on the TV side
- [x] Confirm the mat stays stable for the life of a composition (no
      flicker/recompute mid-display) — no new code needed: mat colour is
      resolved once at queue-regeneration time and baked into the stored
      `QueueItem`, same as every other Presentation field: the TV only
      ever renders what it's given, never recomputes
- [x] Unit tests: colour analysis, candidate generation, mat scoring
      (§11.1) — 50 tests: `oklch.test.ts` (round-trips, hue-wrap-safe
      averaging), `dominantColour.test.ts` (k-means on synthetic points +
      real sharp-encoded synthetic images, including a "picks the larger
      of two regions" test and a corrupt-bytes fallback test),
      `matCandidates.test.ts`, `matScoring.test.ts`, `matMode.test.ts`,
      `cache.test.ts` (fake in-memory store, no real DB needed)

### Real-data calibration fix (same lesson as Phase 4, applied again)

The first version of the `darker` candidate's lightness floor (0.08)
looked fine in unit tests but, checked against a real dark photo via the
live stack, rendered at `#030201` — functionally indistinguishable from
the fixed `BLACK` mode (`#040302`). OKLCH's lightness scale compresses
very hard near black (verified directly: L=0.08 and L=0.16 both render
as near-invisible sRGB deltas). Raised the floor to 0.18 and the min
chroma from 0.01 to 0.03; re-verified against the same photo — `DARK` now
renders `#190f03`, clearly a deep tinted brown, clearly distinct from
`BLACK`. Recorded here rather than only in the code, because it's the
second time in two phases that an aesthetic threshold only turned out to
be wrong once checked against a real photo — worth remembering as a
pattern for Phase 6+ too, not just this one constant.

### Two real rendering bugs found and fixed from a photo of the actual screen

The colour engine and the framing concept were both confirmed correct on
the first real-hardware pass ("colors and effects look good. Subtle."),
but a phone photo of the TV caught two layout bugs neither the unit tests
nor a description could have:

1. **The inner-edge highlight only ever appeared on one side.**
   `tv/src/render/ImageStage.ts` used `inset 0 1px 0 rgba(255,255,255,0.07)`
   for the bevel highlight — an *offset* inset shadow, which CSS only ever
   paints along one edge (the one the offset points away from), not a
   perimeter. Fixed by switching to `inset 0 0 0 1px` (zero offset, 1px
   spread instead) — a spread-only inset shadow paints evenly on all four
   sides.
2. **Some photos had no mat margin at all on two sides.** Even after fix
   #1, a real height-constrained photo (contain-fit maxed out on height,
   touching the screen's top and bottom edges exactly) still showed no
   visible border top/bottom — there was no mat pixel there for a
   highlight to render against in the first place. Contain-fit had been
   sizing each photo against its *slot's* full bounds with zero reserved
   margin, so a photo whose aspect ratio happened to match its slot on one
   axis would touch that slot's edge on that axis, mat or no mat. Real
   picture matting doesn't work that way — the mat opening is a fixed
   margin cut on every side, independent of the print's own proportions.
   Fixed by giving every slot a uniform `2.5vmin` padding (viewport-
   relative, not slot-relative, so a two/three-portrait composition's
   individual photos get the same real-pixel margin as a full-screen
   single) before contain-fit runs, and dropping the separate inter-slot
   `gap` now that per-slot padding already provides it.

Both fixes rebuilt, redeployed to the real TV, and **confirmed by the
user from the physical screen**: bevel visible on all four sides, mat
margin consistently present regardless of a photo's own aspect ratio.
Worth remembering generally: a layout/CSS effect being "correct in
concept" and "visible in the unit tests' intent" doesn't mean it's
correct in practice — this needed an actual photo of the actual screen to
catch, the same way Phases 4-5's colour thresholds needed real EXIF/real
photos to catch.

## Phase 6 — Memories Web Dashboard ✅ complete

*(Milestone 6, §4.2)*

Two real backend gaps had to be closed before "the dashboard" could mean
anything: the API had **zero authentication** (every admin endpoint —
including reconfiguring a TV — was wide open to anyone on the LAN), and
nothing tracked what a TV was *actually* displaying (only that it had
been handed batches of queue items, which runs ahead of what's on
screen). Both are now real: `api/src/auth/` (scrypt password hashing, a
JWT session token signed with `SESSION_SECRET`, a `requireAuth`
preHandler) gates every admin-facing route in `tvs.ts` and the
list/assets routes in `albums.ts` — but deliberately *not* the
device-facing TV routes or the thumbnail proxy, which the TV itself
calls with no login concept at all (§6, §13). The TV now reports its
`currentPresentationId`/`paused` state on every heartbeat
(`Tv.currentPresentationId`/`paused`, migration
`20260903154749_tv_status_reporting`), which `GET /tvs/:id` resolves
into real `current`/`next` Presentation data for the dashboard.

`web/` is a real React+Vite SPA: `api/client.ts` (typed fetch wrapper,
bearer-token auth), `auth/AuthContext.tsx`, and components for the login
screen, TV list pane, per-TV detail pane (current image + EXIF, next
strip, transport controls), config form, and pairing form — styled with
a small hand-written stylesheet, no UI framework.

- [x] Scaffold the React + TypeScript app (`web/`), wired into
      `docker-compose.yml` — already existed from Phase 0; found and
      fixed a real bug in it (see below) rather than just building on top
- [x] Implement login/auth against the Memories API — `api/src/auth/`
      (new), `POST /auth/login` + `GET /auth/me`; no self-registration UI
      on purpose (§12: single admin-capable user model), accounts
      provisioned via `npm run create-user` (`api/scripts/create-user.mjs`)
- [x] Implement the TV list pane: all paired TVs, online/offline status,
      current album at a glance — `TvListPane.tsx`; online is computed
      server-side (`lastSeenAt` within 90s, 3x the heartbeat interval)
- [x] Implement the per-TV detail pane: current image + full EXIF, and a
      next-queue thumbnail strip (clickable for metadata) — `TvDetailPane.tsx`,
      polls `GET /tvs/:id` every 8s
- [x] Implement the per-TV config form: album, interval, playback mode,
      mat mode — `ConfigForm.tsx` (also exposes `disconnectedBehavior`,
      not just the four named fields, since the endpoint already accepted
      it)
- [x] Implement "Save / Push to TV" — bumps config version, regenerates
      the queue, and notifies the TV — reuses the existing `PUT
      .../config` → `regenerateQueue` path unchanged; the TV picks it up
      on its next `/playlist` poll
- [x] Implement transport controls (next/previous/pause/resume) wired to
      the command queue — `TransportControls.tsx`
- [x] Implement the pairing UI: enter a code, name the TV — `PairingForm.tsx`.
      **"assign permitted users" deliberately not built**: still the §12
      single-admin-user default: every logged-in user can see/control
      every TV; `TvPermission` stays unused until that default is revisited
- [x] Implement the album picker sourced from `GET /api/v1/albums` —
      used in `ConfigForm.tsx`; the also-unused `Album` local-cache table
      from Phase 0 stays unused too — hitting Immich live for an
      admin-only, low-frequency picker is simpler than keeping a cache in
      sync for no real benefit
- [x] Layout/usability pass matching the sketch in §4.2 — left TV list /
      right detail pane, dark gallery-toned theme consistent with the
      product's own aesthetic

### Verified against the real stack, through the real UI — not curl this time

Logged in, paired a real TV, configured it with the real 58-photo album,
saved/pushed config, clicked transport controls, and clicked a next-queue
thumbnail for its metadata — all driven through an actual headless
Chromium browser (Playwright, installed ad hoc in the scratchpad, not
added to the project) against the real docker-compose stack and the real
physical TV, with screenshots at each step and `console --errors`
checked after every interaction. Three real bugs turned up this way,
none of them visible from `tsc`/unit tests alone:

1. **`web/Dockerfile` / `docker-compose.yml` never actually applied
   `VITE_API_BASE_URL`.** It was set as a container `environment:` var,
   which only affects the running process — but Vite bakes `VITE_*` vars
   into the bundle at *build* time, and the build stage never received
   it. The dashboard would have shipped hardcoded to
   `http://localhost:4000` regardless of `.env`. Fixed by passing it as
   a Docker build `ARG` instead.
2. **`@fastify/cors@11.x` requires Fastify 5**; this project pins
   Fastify 4 (`^4.27.0`). `npm install @fastify/cors` grabbed the latest
   major without checking, and the API container crash-looped on boot
   (`FST_ERR_PLUGIN_VERSION_MISMATCH`) — never caught locally since
   `npm test`/`tsc` don't boot the real Fastify instance. Pinned to
   `^9.0.1`, the last major compatible with Fastify 4.
3. **A TV paired before its album was configured got stuck forever.**
   `PlaybackController.start()`'s empty-queue retry loop (Phase 3) was
   bounded — 10 attempts, then permanently gave up with no further retry
   of any kind, even after a real queue later appeared server-side. Since
   pairing and configuring are two separate dashboard steps by design
   (§5.9 then §4.2), this is the *normal* order of operations, not an
   edge case — and it silently broke the exact flow this phase's pairing
   UI enables. Fixed by removing the permanent give-up: fast retries
   (3s) for the first ~30s (Phase 3's original "queue regen in flight"
   race), then a gentle indefinite retry (every 20s) forever after —
   there's no scenario where a kiosk display should ever stop trying.
   Confirmed fixed end-to-end: paired via the real UI, configured via the
   real UI, watched `currentPresentationId` populate ~30s later without
   restarting the app.

Also caught (not a bug, but worth recording): `LoginScreen.tsx` was
catching every login failure — wrong password, network error, server
unreachable, anything — into the same generic "Invalid email or
password" message. That's the right call specifically for a real 401 (an
intentional, security-conscious choice — never reveal whether an email
exists), but it actively hid the real cause of bug #2 above during
testing. Narrowed to only show that message for an actual 401; anything
else now says the API couldn't be reached.

### Addendum: location map (user-requested after Phase 6 landed)

PROJECT.md §12 originally defaulted GPS/location EXIF to "never surfaced,
anywhere." Revisited on request: a map now sits to the right of the
featured photo in the detail pane, showing where it was taken.

- [x] `GET /assets/:id/location` (new, `requireAuth`) — fetches a single
      asset fresh from Immich (`ImmichClient.getAsset`, verified against
      the real instance: real field names are `latitude`/`longitude`/
      `city`/`state`/`country`) and returns just those five fields.
      Deliberately its own endpoint, not added to Presentation/QueueItem
      — the TV must never receive GPS at all, not just never render it,
      so this stays completely outside the `regenerateQueue`/`/playlist`
      pipeline. **Confirmed** by inspecting a real `/playlist` response
      after this shipped: no latitude/longitude/city anywhere in it.
- [x] `LocationMap.tsx` — plain Leaflet (not react-leaflet), standard
      OpenStreetMap tiles, no API key. A `circleMarker` instead of
      Leaflet's default pin, sidestepping the well-known bundler/default-
      marker-icon-path issue entirely rather than working around it.
      **First version used CARTO's free dark-tile URL instead of plain
      OSM** — visually nicer (actually dark, not just inverted), but the
      user spotted a real problem from an actual screenshot that my own
      "did the tile request return 200" check completely missed: CARTO's
      anonymous dark-tile endpoint now requires an API key, and instead
      of erroring it serves a *watermarked "API key required" placeholder
      image* with a 200 status — indistinguishable from a real tile at
      the network level. Switched to `tile.openstreetmap.org` (the
      canonical, genuinely-free-forever OSM tile server) and got the dark
      look back via a CSS `invert()`/`hue-rotate()` filter on the tile
      layer instead — doesn't depend on any single provider's free tier
      surviving. Hit a second, smaller bug getting the filter applied:
      Leaflet's `tileLayer({ className })` option lands on the layer's
      wrapping `<div class="leaflet-layer">`, not on each tile `<img>` —
      confirmed by inspecting the real rendered DOM, not guessed. Both
      fixes rebuilt, redeployed, and reconfirmed by actually looking at a
      screenshot of the rendered tiles (not just "the network request
      succeeded") before calling it done.
- [x] `TvDetailPane.tsx` restructured around one "featured photo" concept
      (photo + EXIF + map together) instead of two separate EXIF blocks —
      simpler, and it's what the requested interaction actually needed:
      clicking a "next" thumbnail features that photo (photo/EXIF/map all
      update together); clicking the featured photo itself resets back to
      whatever the TV is currently displaying. Location is fetched
      on-demand per focused asset id, cancelling/ignoring stale
      in-flight requests if the user clicks again before one resolves.
- [x] Verified through the real docker-built dashboard (not the dev
      server) against the real physical TV and real EXIF: map renders
      with live tiles, clicking a next-photo moves the marker to that
      photo's real coordinates, clicking the featured photo resets it —
      confirmed with precise lat/long pulled directly from two different
      real assets (~2.7km apart, different suburbs), not just eyeballing
      the screenshot.

### Addendum: dashboard only ever showed one photo of a composition

User-caught, from actually looking at the dashboard rather than a
screenshot: the featured-photo box and the "next" thumbnails only ever
rendered `presentation.assets[0]`, regardless of how many photos the
composition actually had. Real data confirmed it immediately — a
two-portrait item genuinely showed just one of its two photos, in both
places. The exact same bug class as Phase 4's original TV-side
`PresentationRenderer` issue (`assets[0]` only), just never ported over
when the dashboard was built in Phase 6 — composition-awareness had to
be added there too, it didn't come for free.

- [x] `TvDetailPane.tsx`: new `slotAssets()` resolves every
      `layout.slots` entry to its asset by id (same approach as the TV's
      `PresentationRenderer.render()`), used for both the featured box
      and the next-strip thumbnails instead of a single first-asset call
- [x] Featured box now renders one `<img>` per slot, each an equal share
      of the frame, contain-fit (never crop/stretch, same rule as the TV)
      — verified against a real two-portrait item: both photos shown
      correctly proportioned, no distortion
- [x] EXIF panel shows a block per photo in the composition (filename +
      its own exposure/timestamp), not just one — album shown once at
      the top since it's the same for every photo in the composition
- [x] Next-strip thumbnails also split into one slice per photo instead
      of only showing the first — confirmed via a real two-portrait
      thumbnail rendering 2 `<img>` elements, not 1
- [x] Location map intentionally still shows one marker (the
      composition's first/leftmost photo) — a 2/3-up group is normally
      photos taken moments apart in the same place, and per-photo map
      selection wasn't asked for

### Addendum: delete/remove a TV

Every fresh `npm run deploy` wipes the app's `localStorage` and re-pairs
under a new device id (known since Phase 3) — across Phases 4-6 testing
this left 8 stale "Lounge" rows cluttering the TV list with no way to
clean them up.

- [x] `DELETE /api/v1/tvs/:id` (new, `requireAuth`) — schema.prisma's
      `Configuration`/`QueueItem`/`Command`/`TvPermission` relations to
      `Tv` now cascade-delete (migration `20260903163704_tv_delete_cascade`);
      `AuditLog`'s stays `SetNull` (already the default for its
      already-optional relation, so no migration diff there) — deleting a
      TV shouldn't erase its own history, just its live state
- [x] A small delete button per row in `TvListPane.tsx`, hidden until
      hover so the list doesn't read as "every row screaming delete at
      you," behind a native `confirm()` naming the TV and its online/
      offline status (cheap insurance against deleting the one that's
      actually live by mistake)
- [x] `Dashboard.tsx` clears the selection and falls back to whatever's
      left if the deleted TV was the one being viewed
- [x] **Verified through the real docker-built dashboard**: deleted 7 of
      8 stale entries via real hover+click+confirm interactions, left
      with exactly the one real online TV, its data (current image,
      EXIF, map, next queue, config) fully intact afterward. Confirmed
      directly against Postgres: zero orphaned `Configuration`/
      `QueueItem` rows, and the unrelated `AssetColourAnalysis` cache
      (keyed by Immich asset id, not TV) untouched at 49 rows

## Phase 7 — Resilience ✅ complete

*(Milestone 7, §5.8, §5.10)*

Two fields (`Configuration.cacheSize`, `Configuration.disconnectedBehavior`)
had existed in the schema/zod validator/PUT handler since Phase 0/2 but were
never actually consumed anywhere — this phase is what finally reads and
acts on them. `@fastify/websocket ^10.0.0` was also already an installed,
Fastify-4-compatible dependency, pre-staged but never registered — a strong
signal this was the intended push mechanism, so no WebSocket-vs-SSE
decision was needed.

- [x] TV rolling cache — `tv/src/cache/ImageCache.ts`: an in-memory
      `Map<url, {objectUrl, size, lastUsed}>` built from `fetch().blob()` +
      `URL.createObjectURL`, LRU-evicted against a ~200MB soft ceiling.
      Deliberately *not* a Tizen-specific storage API or the browser Cache
      Storage API — `TizenAdapter.ts` exposes no filesystem/storage surface
      today, and either option would need a new, unverified Tizen manifest
      privilege; plain Blobs need none and work identically in the
      browser-dev fallback. `Configuration.cacheSize` (presentation count,
      already schema-configurable, default 8) is now dashboard-exposed
      (`web/src/components/ConfigForm.tsx`) and TV-honored —
      `PlaybackController` bounds the queue to `cacheSize` upcoming items
      and trims consumed items down to a 1-item back-buffer (just enough
      for one Previous press), evicting the image cache to match on every
      trim
- [x] TV request-more logic — unchanged trigger condition
      (`REFILL_THRESHOLD`), but now also capped by remaining `cacheSize`
      room and paired with prefetching: `PlaybackController.fetchMore()`
      kicks off `ImageCache.prefetch()` for newly-fetched items in the
      background, so images are typically already cached by the time
      they're actually shown
- [x] Disconnected-behaviour policies (`PlaybackController`) — 2
      consecutive failed heartbeat/playlist-fetch attempts (shared
      failure/success counters) mark the TV offline. **User-clarified
      scope**: `CONTINUE_QUEUE` and `REPEAT_QUEUE` get no behavioral
      distinction — the spec names them almost identically and gives no
      real hook to differentiate — both just loop the full cached queue
      indefinitely once exhausted (`next()` wraps to index 0 instead of
      stalling). `FREEZE` clears the advance timer via a separate
      `autoFrozen` flag (distinct from the viewer's own `paused`), so a
      manual pause always survives a reconnect untouched, and unfreezing
      restarts the timer via a new `PresentationRenderer.restartTimer()`
      rather than a full re-render — no visible re-fade on reconnect. The
      "retry every N minutes in the background regardless of mode"
      requirement is satisfied by the existing 30s heartbeat interval,
      which never stops firing
- [x] Config versioning + push — `api/src/realtime/hub.ts` (new,
      in-process `Map<deviceId, Set<WebSocket>>`, no external pub-sub
      needed for a single-instance household deployment) backs a new
      device-facing `GET /tvs/:deviceId/ws` route
      (`{ websocket: true }` via `@fastify/websocket`); the admin PUT
      `.../config` handler broadcasts `{type:'config-changed', configurationVersion}`
      to it after `regenerateQueue`. The **guaranteed polling fallback**
      isn't a new timer — it's the TV's existing 30s heartbeat, whose
      response (`POST /heartbeat`) now also carries
      `configurationVersion`/`cacheSize`/`disconnectedBehavior`, so
      correctness never depends on the WebSocket staying connected.
      `tv/src/realtime/ConfigSocket.ts` wraps the client side: reconnects
      with backoff, and is a safe no-op (feature-detected) if `WebSocket`
      isn't available on this Tizen firmware. Either path calls
      `PlaybackController.applyConfigVersion`, which discards not-yet-shown
      stale queue items and eagerly refetches — the currently-displayed
      item is never touched, so a save takes effect within seconds instead
      of however long the old reactive-refill-only design happened to take
      (this is the exact bug the user hit earlier: "pressed save, still
      playing the old selection")
- [x] Graceful reconnect/backoff — `tv/src/net/backoff.ts` (new, shared
      exponential backoff, also replacing `PlaybackController.start()`'s
      old two hardcoded retry constants with one implementation), used by
      `ConfigSocket`'s reconnect. API-side: `ImmichClient.request()` now
      retries a network error or 5xx up to 3 attempts (500ms/1500ms
      delays) — never a 4xx — so a transient Immich blip no longer fails a
      whole config save
- [x] First test runner for `tv/` — `tsx --test`, mirroring `api/`'s setup
      (PROJECT.md §11.1 explicitly names "cache eviction" as something
      needing unit tests; there was nowhere to put one before this).
      24 new tests across `ImageCache`, `backoff`, `ConfigSocket`, and
      `PlaybackController` (loop-vs-stall per policy, freeze/resume vs.
      manual pause, config-version-triggered refetch, cache-size bounding)
- [x] **Verified against the real stack, not just unit tests**: rebuilt
      the API container; connected a raw `ws` client to the real
      `/tvs/:deviceId/ws` endpoint and confirmed a real config save
      delivered `{"type":"config-changed","configurationVersion":7}`
      immediately; confirmed the real `/heartbeat` response now carries
      the three new fields. Redeployed the Phase 7 build to the physical
      TV (`npm run deploy 10.10.10.80` — uninstalls/re-pairs, per known
      behaviour since Phase 3; re-paired and restored its config)
- [x] **Verify (real hardware): disconnect → continues from cache, reconnect
      → catches up cleanly** — `docker stop memories-api-1` for 90s (three
      missed heartbeats) while the real paired TV kept running. No crash;
      `lastSeenAt` resumed updating within one heartbeat interval of
      `docker start`, with no re-pairing needed this time (unlike a
      redeploy, a plain API outage doesn't touch the TV's `localStorage`)
- [x] **Verify (real hardware): config change while offline → picked up on
      reconnect** — pushed a real config change
      (`intervalSeconds: 20 -> 15`) the moment the API came back up;
      confirmed via Postgres that the TV's `currentPresentationId` moved to
      a `QueueItem` from the newly regenerated queue (`durationSeconds: 15`)
      shortly after, then reverted the interval back to 20 afterward so the
      live TV was left exactly as found

## Phase 8 — Hardening & Acceptance ⚠️ mostly complete (soak testing pending)

*(Milestone 8, §11.1, §11.3)*

Two items in this phase are genuinely real-time activities (running for
24 hours, then multiple days, actually elapsed) that cannot be completed
by writing code in one sitting — marked below as infrastructure-ready
rather than checked off. Everything else is done.

- [x] Add structured logging across API and TV (Immich connection, API
      failures, downloads, cache ops, composition generation, Tizen
      lifecycle) — confirm nothing sensitive is ever logged (§9.15).
      **API**: `api/src/log.ts` — one shared pino instance, passed to
      Fastify's own `logger` option (`main.ts`) and imported directly by
      app-level modules below the HTTP layer, so everything lands in one
      structured stream. `disableRequestLogging: true` turns off Fastify's
      automatic per-request line — a TV's heartbeat/playlist/commands
      polling every few seconds would otherwise drown out the events that
      actually matter. Explicit log sites: `ImmichClient.request()`
      (retries and final failures, path/attempt/status — never headers or
      body, matching the pre-existing "don't echo the API key" comment
      there), `playlist/queue.ts`'s `regenerateQueue` (start/success/
      failure with item counts, duration, and a debug-level colour-cache-
      miss count), `routes/tvs.ts` (pairing completed, config saved,
      command enqueued, TV deleted), `routes/settings.ts` (Immich account
      connected/disconnected/verification-failed — user id only, never
      the key), and a 30-minute `process.memoryUsage()` sample in
      `main.ts`. `LOG_LEVEL` env var (default `info`) controls verbosity;
      documented in `.env.example` and the README.
      **TV**: `tv/src/log/Logger.ts` — a small leveled logger backed by a
      200-entry ring buffer (kept regardless of the display level, so the
      diagnostics view below can show recent history even when nothing
      was printed to the console) with its own unit tests
      (`Logger.test.ts`). Default level is `warn` on a real device,
      `debug` under `vite dev` — guarded against `import.meta.env` not
      existing at all under the `tsx --test` runner. Wired into `main.ts`
      (startup, pairing, fatal errors), `PlaybackController` (offline/
      reconnect transitions, config-version changes, playlist-fetch
      failures — replacing the previous bare `console.error` calls),
      `ImageCache` (eviction summaries), `ConfigSocket` (reconnect
      attempts, at debug — the heartbeat is the guaranteed fallback, so a
      flaky push channel alone isn't a "problem"), and `TizenAdapter`
      (key-registration failures, and lifecycle via the standard Page
      Visibility API — deliberately not an unverified Tizen-specific
      lifecycle API, per §15.2/§15.5). Confirmed nothing sensitive is ever
      logged: the TV never holds Immich credentials at all (§6/§13), and
      every API-side Immich log site was checked against the existing
      "never log API keys/credentials/tokens" convention.
- [x] Add a hidden TV diagnostics view (connection status, current/next
      asset, cache size, last sync, last error, app version) — reachable
      but never shown during normal playback.
      `tv/src/diagnostics/DiagnosticsView.ts` — a small corner overlay
      (not full-screen, never blocks the photo), toggled by pressing the
      remote's **Up** key 3 times within 2 seconds
      (`main.ts` — Up is otherwise unused during normal playback, so this
      can't be triggered by a stray remote press, and isn't a documented
      button). Shows: connection status + paused state, last sync time,
      queue length, current/next filename, cache entry count + bytes,
      live memory (via `diagnostics/MemorySampler.ts`, feature-detected —
      see below), the logger's most recent warning/error, and the app
      version (baked in at build time from `package.json` via a new Vite
      `define` in `vite.config.ts`, `__APP_VERSION__`). Backed by a new
      `PlaybackController.diagnosticsSnapshot()` method returning a plain
      data snapshot rather than exposing internals directly.
- [~] Memory/resource profiling pass on the TV across repeated playback
      cycles — **infrastructure-ready, not a real on-device pass.**
      `performance.memory` sampling exists (`MemorySampler.ts`, feature-
      detected — this is a non-standard, Chromium-only API; Tizen's
      engine has historically exposed it but this isn't guaranteed across
      Tizen versions, so it's a silent no-op where absent rather than a
      false claim) and logs every 5 minutes, visible live in the
      diagnostics view. As a mechanical stand-in for actual multi-day,
      on-device behavior — which needs real elapsed time and real
      hardware, neither available in one sitting — added
      `tv/src/playback/PlaybackController.growth.test.ts`: drives 2000
      simulated advances through an endless stream of *never-repeated*
      assets (harder to bound than any real, finite, looping album)
      against the real `ImageCache` (not a fake — eviction genuinely
      runs), asserting the in-memory queue and cache both stay bounded
      rather than growing with how many photos were ever shown.
      **Verified the test actually catches a regression**, not just
      passing vacuously: temporarily disabled `PlaybackController`'s
      `trimQueue()` call, reran the test, watched it fail
      (`peaked at 2005` unbounded queue growth), then restored the real
      file and confirmed it passes again. This proves the bounded-growth
      invariant, not the absence of every possible leak — it doesn't
      replace a real soak test below.
- [ ] Run a 24-hour soak test; fix anything it surfaces — **not run**.
      Genuinely needs 24 real hours against the physical TV; the logging
      and diagnostics infrastructure above is what makes this observable
      once it happens (structured logs to watch, live memory in the
      diagnostics view, the growth test as a pre-check). Deploy the
      current build (`cd tv && npm run deploy`), leave it running, and
      check back — `docker compose logs api` and the TV's own console/
      diagnostics view (Up×3) are what to watch.
- [ ] Run a multi-day soak test once the 24-hour pass is clean — **not
      run**, blocked on the item above by definition.
- [x] Write/update the README: setup, dev workflow, `docker-compose up`
      deployment, and troubleshooting (§15.9) — rewritten from a 23-line
      stub to cover prerequisites, `.env` setup (including the Phase-8-
      addendum `ENCRYPTION_KEY`/`LOG_LEVEL`), per-user Immich account
      connection, dev workflow per package, testing, the new logs/
      diagnostics section, TV build & deploy, and a troubleshooting list
      of every real issue hit during earlier phases (Alpine musl DNS,
      Tizen's silent `config.xml` access-whitelist block, the CARTO
      tile-key bait-and-switch, Apple Silicon/Tizen Studio, the retail-
      certificate chain error, the Postgres 5433 port, `api/.env` vs. the
      root `.env`).
      **Found and fixed a real gap along the way**: `api/Dockerfile`'s
      `CMD` was just `node dist/main.js` — no migration ever ran
      automatically, so acceptance criterion 17 ("the entire backend/web
      stack runs from a single `docker-compose up`") was actually false
      for a genuinely fresh clone (a brand-new Postgres volume had no
      tables until someone ran `prisma migrate deploy` by hand). Changed
      the `CMD` to `npx prisma migrate deploy && node dist/main.js` and
      verified against a real, throwaway, empty Postgres container (not
      the dev database) — all 7 migrations applied in order, the server
      started, `/healthz` returned `200 {"status":"ok"}`; then confirmed
      re-running it against the already-migrated dev database is a safe
      no-op ("No pending migrations to apply").
- [x] Walk every item in Acceptance Criteria (§11.3) and mark pass/fail —
      see the table below.
- [x] Final check against "Things Claude Must Not Do" (§13) — confirm
      none were violated. Reviewed each of the 11 items against every
      change made in this phase (and, in passing, the per-user-Immich-
      credentials work immediately before it): no Immich UI/credentials
      ever touched the TV; no scraping or invented endpoints; no
      full-resolution downloads, cropping, or stretching; the diagnostics
      view is hidden by default (toggle-only, never auto-shown, no
      permanent on-screen overlay) and is a small monospace corner panel,
      not a "normal website" or desktop-style interface; every new
      feature-detects rather than assumes desktop-browser capabilities
      (`performance.memory`, Page Visibility API); no new large
      dependency (`pino` was already an installed transitive dependency
      of Fastify — made explicit, not added), no Kubernetes/managed DB;
      no secret ever logged (checked every new log call site by hand) or
      committed (`.env` stays gitignored); nothing added blocks playback
      on a network call or fails hard on a brief outage. None violated.

### Acceptance Criteria (§11.3) — pass/fail walk

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Tizen client installs and runs on `QA32LS03CBWXXY` | ✅ Pass | Confirmed working end-to-end in earlier phases (PROJECT.md §10); the physical TV was actively heartbeating against the live API throughout this session's work, unaffected by it |
| 2 | API connects/authenticates to Immich; only the API holds the credential | ✅ Pass | Now per-user rather than one global key, but the invariant holds: credentials live encrypted in Postgres, decrypted only server-side, never returned by any API response, never seen by the TV or in the browser |
| 3 | Pair via on-screen code, name it, manage from Web | ✅ Pass | `routes/tvs.ts` pairing endpoints + `web/src/components/PairingForm.tsx`/`TvListPane.tsx`, exercised repeatedly across earlier phases |
| 4 | Pick an album/settings from the dashboard; takes effect without TV-side steps | ✅ Pass | `ConfigForm` → `PUT .../config` → `regenerateQueue` → WS push (heartbeat fallback if it misses) |
| 5 | Photos display without cropping or stretching | ✅ Pass (per existing coverage) | `render/ImageStage.ts` + `composition/orientation.test.ts`; not re-verified visually on hardware this session |
| 6 | Sensible resolutions, not full-resolution originals | ✅ Pass | Every asset URL requests Immich's `size=preview` thumbnail (`ImmichClient.fetchThumbnail`'s default), never an original |
| 7 | Portraits grouped 2-3 up; landscapes never forced into a portrait slot | ✅ Pass | `composition/group.test.ts` — extensive coverage, unchanged this phase |
| 8 | Mixed-orientation albums produce attractive, non-repetitive compositions | ✅ Pass | Same test suite as above |
| 9 | Auto-generated mat colours (colour theory) with a working manual override | ✅ Pass | `colour/matMode.ts` + `matCandidates.ts`/`matScoring.ts`, `matMode: AUTOMATIC` vs. an explicit choice |
| 10 | Transitions subtle/smooth on real hardware | ✅ Pass (per earlier phases) | Crossfade, `presentation.ts`; last visually verified on hardware in Phase 5, not re-verified this session |
| 11 | Sequential/shuffle both work; sensible resume after a restart | ✅ Pass | `seededShuffle`; resume position is server-side (`Tv.lastServedPosition`, DB-persisted), so a TV app restart resumes from where the *server* last left off, not from zero |
| 12 | Dashboard shows current image + full EXIF, and what's coming next | ✅ Pass | `TvDetailPane.tsx`'s "Now Showing"/EXIF panel/"Next" strip |
| 13 | Continues through a temporary Immich/API outage via local cache; recovers automatically | ✅ Pass | `PlaybackController` offline/reconnect + `ImageCache`; verified against real hardware in Phase 7 (`docker stop` for 90s) |
| 14 | Remote-control transport works from both the physical remote and the dashboard | ✅ Pass | `TizenAdapter` key mapping + `TransportControls.tsx` / command polling |
| 15 | No persistent controls/metadata left on screen during normal playback | ✅ Pass | The new diagnostics view included — hidden by default, toggle-only, never auto-shown |
| 16 | Runs for an extended period (soak-tested) without observable degradation | ⚠️ Infra ready, not run | See the two unchecked soak-test items above — this is the one criterion this phase could not actually complete |
| 17 | The entire backend/web stack runs from a single `docker-compose up` | ✅ Pass (fixed this phase) | Was false for a fresh clone before the Dockerfile fix above — now verified against a real, throwaway, empty Postgres |
| 18 | No external/cloud service required anywhere in the pipeline | ✅ Pass | Immich, Postgres, and the Memories stack are all self-hosted; the dashboard's location map uses public OpenStreetMap tiles (no API key/account), the only outbound call besides Immich itself |

---

## Post-Phase-8 additions (ad hoc, not part of the original phase plan)

- [x] Account/settings screen — replaced the Immich-only settings panel
      with a general "Settings" screen (`web/src/components/
      SettingsScreen.tsx`): every user gets Immich API key, Change
      Password, and Sign out; admins additionally get Register New User
      (generated temp password, shown once) and a Users list with
      per-user Reset Password (`api/src/routes/admin.ts`,
      `AdminUserManagement.tsx`). New accounts and resets set
      `User.mustChangePassword`, enforced both server-side (every other
      dashboard route 403s until `PUT /me/password` clears it —
      `auth/middleware.ts`) and via a mandatory `ForcedPasswordChange`
      screen. Verified end-to-end against the real API (login → forced
      gate blocking a normal route → password change clearing it → admin
      reset re-locking an already-active session immediately →
      non-admin blocked from admin routes), test accounts cleaned up
      afterward.
- [x] Rename a paired TV — `PATCH /api/v1/tvs/:id`, a "Rename" control
      next to the TV's name in `TvDetailPane.tsx` (there was previously
      no way to fix a naming mistake without unpairing and re-pairing).
- [x] App branding/icon — `RAW/icon.png` replaces `tv/public/icon.png`
      (Tizen app icon, kept at the already-verified-working 128×128) and
      is now shown on the web dashboard's login screen
      (`web/public/logo.png`, `LoginScreen.tsx`) and browser tab
      (`web/public/favicon.png`). Worth knowing: at 128×128 the icon's
      "memories" wordmark is essentially illegible — only the framed-
      photo mark reads at that size — used as-is since that's what was
      asked for, but a cropped mark-only variant would look sharper as
      an actual app icon if that's ever wanted.
- [x] Material mat textures + shadow — see PROJECT.md §5.3's addendum
      and §5.4. New `CORK`/`COTTON` MatMode values, `WOOD` upgraded from
      a flat colour to a real (approximated) material texture, and a
      broader soft shadow so a photo visibly casts onto the mat around
      it instead of sitting on a perfectly flat surface. Verified via a
      real logged-in browser session (Playwright) that the Mat dropdown
      lists all 12 modes correctly, plus type-checks and the full test
      suite across all three packages.
- [x] Video playback mode — see PROJECT.md §5.11 (new). Previously
      explicitly out of scope (§14 as written before this); requested
      afterward, so this crosses that off intentionally. New per-TV
      `Configuration.displayMode` (`IMAGES`/`VIDEO`, migration
      `20260905085849_video_playback_mode`) plays the same selected
      album's videos instead of photos; `loop` (VIDEO mode only) replays
      the current video indefinitely versus advancing through the album
      once each, wrapping after the last. Touches all three packages:
      - **API**: `queue.ts`'s `buildVideoQueueRows`/`presentation.ts`'s
        `buildVideoPresentation` fork away from the composition/colour
        engine entirely (skip both — a fixed neutral mat is used
        instead, no per-asset dominant colour to derive one from); a new
        `ImmichClient.fetchVideoStream` + TV-facing streaming proxy
        (`GET /tvs/:tvId/assets/:assetId/video`) pipe Range requests/206
        responses instead of buffering, unlike the thumbnail proxy.
      - **TV**: new `VideoStage` (sibling to `ImageStage`, shared style
        helpers factored into `matStyles.ts`) renders a single
        persistent `<video>`; `PresentationRenderer` forks on a new
        `Presentation.kind` field and arms a watchdog timer alongside
        the video's `ended` event (skipped when looping) so a stalled
        stream still advances instead of freezing the display forever.
      - **Bug found and fixed during implementation, not part of the
        original ask**: `PlaybackController.pause()`/`resume()` both
        called `showCurrent()`, which re-renders — harmless for a photo
        (crossfade-to-self) but would have restarted a playing video
        from frame 0 on every pause/resume. Fixed via new
        `RendererLike.pauseMedia()`/`resumeMedia()` hooks that freeze/
        resume in place; also unified the FREEZE disconnected-behavior
        policy onto the same two methods.
      - **Verified**: full test suite + type-check clean across all
        three packages (112 API tests incl. new `queue.test.ts`/
        `presentation.test.ts`/`ImmichClient` cases, 33 TV tests incl.
        new cache-exclusion and pause/resume-in-place regression tests).
        Web config UI verified end-to-end via a real logged-in browser
        session (Playwright) against an isolated test user + test TV
        row (never the real paired "Mike Office" TV) — Display
        dropdown, conditional Loop checkbox, and Mat/Interval/collage
        fields hiding/reappearing all confirmed, plus a real
        `PUT .../config` round-trip. Caught and fixed a real bug this
        way: the Loop checkbox's `<label>` inherited `flex-direction:
        column` from every other config field, stacking the checkbox
        above its own text instead of inline (new `.checkbox-label`
        CSS class).
      - **Not verified — flagged as follow-up, not silently assumed
        working**: the real Immich video-playback endpoint
        (`/assets/{id}/video/playback`) is unverified against a live
        Immich instance — this codebase's own established practice
        (§10) is to confirm real-server behaviour before trusting the
        spec, and it has been wrong before (width/height). A regression
        test exists (`ImmichClient.integration.test.ts`'s new video
        block) but is skip-gated on `IMMICH_BASE_URL`/`IMMICH_API_KEY`
        env vars, which aren't set in this deployment (Phase 8 moved to
        per-user encrypted keys) — run it manually with those set before
        relying on real video playback. Actual on-device video rendering
        (the TV's `VideoStage`/`<video>` element) was also not visually
        verified against a real Tizen client or real video asset — no
        video content existed in the connected Immich library to test
        against during this pass.
      - **Deployed to the real TV** (`npm run deploy 10.10.10.80`,
        confirmed by `sdb`'s own `install completed`/`successfully
        launched` output and a fresh pairing request landing in the
        database — real Developer Mode Host PC IP mismatch was the
        blocker on the first attempt, resolved on the TV itself) and the
        API/web rebuilt and redeployed via `docker compose build/up`
        (`No pending migrations to apply` confirmed the schema was
        already current). Re-paired as "Lounge".
      - **Addendum, user-reported on the real device**: video was
        rendering small and off-center instead of filling the screen.
        Root cause: `VideoStage`'s `<video>` element only had
        `max-width`/`max-height: 100%` set, not `width`/`height` — a
        replaced element with no explicit size renders at its own
        intrinsic/native resolution rather than filling its container, so
        `object-fit: contain` had nothing to scale *up* to. Fixed by
        giving the video explicit `width: 100%; height: 100%`. Also
        dropped the mat margin/faux-3D framing entirely for video per the
        same feedback ("no need for a mat border if it doesn't make sense
        for video") — video now renders full-bleed with only a flat
        letterbox/pillarbox colour behind it, never a decorative mat (see
        PROJECT.md §5.11's revised wording). Rebuilt/redeployed to the
        real TV and the API; full test suite + type-check reconfirmed
        clean across all three packages.
      - **Addendum, user-reported on the real device (2nd round)**: video
        had a visible "flash" on every play — the `<video>`'s `poster`
        attribute (Immich's thumbnail JPEG) showed while the stream
        buffered, then swapped to the actual decoded first frame once
        playback started, which read as a jarring cut between two
        differently-composed images. Fixed by dropping `<video poster>`
        entirely — the TV now just shows its plain background colour
        while buffering, which is far less noticeable. The thumbnail is
        still fetched/prefetched (Memories Web's "Now Showing"/"Next"
        preview still uses it), just no longer displayed on the TV
        itself. Rebuilt/redeployed to the real TV; full test suite +
        type-check reconfirmed clean.
- [x] TV deploy accepts the Memories API server as a parameter — user is
      planning a separate deployment of the API/web stack on another
      server and needs the TV app to point at it without hand-editing
      source. `main.ts` already read `VITE_MEMORIES_API_URL` at build
      time (baked in from `tv/.env`, gitignored); the only gap was
      `tv/scripts/deploy.cjs` never touched it and required a separate
      manual `npm run build` first. Now `npm run deploy [tvIp]
      [serverUrl]` accepts the server URL as a second argument, writes it
      into `tv/.env` (so every later deploy that omits it reuses the last
      one automatically — "remembered between updates" from the
      operator's side, since this file lives on the dev machine, not the
      TV, and is unaffected by the TV's own localStorage being wiped on
      every reinstall), validates it looks like a real URL before saving,
      and now always rebuilds before signing/installing so a freshly-saved
      URL is never stale. Considered and rejected: an on-device setup
      screen for typing the URL via remote — no text-entry UX exists in
      this app today, and making it survive a redeploy would need an
      unverified switch from uninstall-then-reinstall to an update-in-
      place install. Verified: the `.env` read/write logic against a real
      copy of the file (restored after), full TV test suite + type-check
      clean, `node --check` on the script.

---

## Revisit Later (defaults chosen for now, per PROJECT.md §12)

Not blocking, but flag if reality diverges from the assumption:

- [ ] Permission model — currently single admin-capable user; add roles
      if a second household user needs restricted access
- [ ] GPS/location EXIF — currently never surfaced anywhere; revisit if
      wanted in the dashboard
- [ ] TV cache byte cap — currently ~200MB soft/LRU; adjust if real-world
      image sizes make that too tight or too loose
