# Memories — Task List

Working checklist for building Memories, derived from `PROJECT.md`
(section references in parentheses point back to the spec for full detail).
Check items off with `[x]` as they're completed. Phases are ordered —
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

## Phase 7 — Resilience

*(Milestone 7, §5.8, §5.10)*

- [ ] Implement the TV rolling cache: default 5–10 presentations
      (configurable), ~200MB soft ceiling, LRU eviction (§5.8, §12)
- [ ] Implement TV logic to request more queue items as the cache is
      consumed
- [ ] Implement configurable disconnected-behaviour policies: continue
      cached queue, repeat cached queue, freeze on current image, retry
      interval (§5.10)
- [ ] Implement config versioning + push: WebSocket/SSE from API to TV,
      with polling as a guaranteed fallback (§5.10)
- [ ] Implement graceful reconnect/backoff on both TV and API sides (§9.4)
- [ ] Verify: disconnect the TV from the API → slideshow continues from
      cache; reconnect → catches up cleanly with no visible hiccup
- [ ] Verify: change album/config in the dashboard while a TV is offline
      → it picks up the new playlist once reconnected

## Phase 8 — Hardening & Acceptance

*(Milestone 8, §11.1, §11.3)*

- [ ] Add structured logging across API and TV (Immich connection, API
      failures, downloads, cache ops, composition generation, Tizen
      lifecycle) — confirm nothing sensitive is ever logged (§9.15)
- [ ] Add a hidden TV diagnostics view (connection status, current/next
      asset, cache size, last sync, last error, app version) — reachable
      but never shown during normal playback
- [ ] Memory/resource profiling pass on the TV across repeated playback
      cycles
- [ ] Run a 24-hour soak test; fix anything it surfaces
- [ ] Run a multi-day soak test once the 24-hour pass is clean
- [ ] Write/update the README: setup, dev workflow, `docker-compose up`
      deployment, and troubleshooting (§15.9)
- [ ] Walk every item in Acceptance Criteria (§11.3) and mark pass/fail
- [ ] Final check against "Things Claude Must Not Do" (§13) — confirm
      none were violated

---

## Revisit Later (defaults chosen for now, per PROJECT.md §12)

Not blocking, but flag if reality diverges from the assumption:

- [ ] Permission model — currently single admin-capable user; add roles
      if a second household user needs restricted access
- [ ] GPS/location EXIF — currently never surfaced anywhere; revisit if
      wanted in the dashboard
- [ ] TV cache byte cap — currently ~200MB soft/LRU; adjust if real-world
      image sizes make that too tight or too loose
