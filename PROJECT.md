# Memories

A self-hosted, multi-TV digital-art / photo-frame system built around a
Samsung Frame TV, sourced from a self-hosted **Immich** photo library. This
document is the master technical brief for the whole system.

This is the second revision of this brief. An earlier version
(`PROJECT_OLD.md`, kept for reference) specified a single, self-contained
Tizen app that talked to Immich directly. That design is **superseded**: the
system was deliberately re-architected so the TV is a thin renderer and a
new **Memories API** does all the creative/decision-making, enabling
multiple TVs and multiple household users from one dashboard. Everything in
`PROJECT_OLD.md` about product aesthetic, composition/colour rules, hardware
facts, and engineering discipline still applies — it has been folded in
below — only the "one fat Tizen app talking straight to Immich" architecture
has been replaced.

---

## 1. Product Vision

Memories should feel like a **digital picture frame**, not a media browser
or an app.

- The photograph is the focus. No unnecessary chrome, captions, metadata,
  or overlays during normal playback.
- Photographs are **never cropped or stretched** — composition and mats
  solve the aspect-ratio problem, not cropping.
- Portrait photographs are grouped intelligently (2–3 up) rather than
  centred in a sea of empty space.
- Mats/borders look intentional and gallery-like, not like a web UI card.
- It runs unattended for weeks, recovers gracefully from network blips and
  errors, and feels calm and polished on startup and between images.

**Definition of "beautiful"** (the acceptance bar for the whole visual
system): if someone walks into the room and sees Memories running, they
should think the TV is displaying a professionally framed photograph — not
running an application. The UI disappears. The mat feels physical. The
composition feels deliberate. The photograph remains the star.

## 2. Target Hardware & Environment (known facts)

- **TV**: Samsung The Frame 32", 2023 — model `QA32LS03CBWXXY`.
- **Display**: 1920×1080, 16:9, matte anti-reflection panel, 50Hz native
  refresh, Tizen OS (LS03C series).
- **Network**: originally on an IoT VLAN (`10.10.40.0/24`). **Moved to the
  main lab subnet during Phase 0** (`10.10.10.0/24`, currently
  `10.10.10.80`) after discovering that Tizen's `sdb` debug bridge
  (port 26101) gets refused across the VLAN boundary even though other
  TCP ports on the TV (8001, 8080, 9197) work fine cross-VLAN — this looks
  like an `sdbd`-specific restriction, not a general firewall block.
  `sdb`/port 26101 is a **development-time-only** concern (installing/
  debugging builds); the finished app only ever talks to the Memories API
  over normal HTTPS/WebSocket, so it's an open question whether the TV
  needs to stay on `10.10.10.0/24` permanently or can move back to the
  IoT VLAN once active development winds down (see §12). Regardless:
  never hard-code IPs in the app itself; all server URLs must be
  configurable.
- **Development machine**: macOS, with physical access to the TV
  (Developer Mode can be enabled, IP obtained, app deployed/debugged
  directly).
- **Photo source**: self-hosted Immich instance on the local network.
  Only the Memories API ever holds Immich credentials or talks to its API
  (see §3, §6) — verify current endpoints/auth against the official docs
  rather than assuming historical behaviour:
  - https://api.immich.app/
  - https://docs.immich.app/api/
- **Samsung/Tizen references** (verify compatibility with this TV's
  installed firmware before committing to an approach):
  - https://developer.samsung.com/smarttv/develop
  - https://developer.samsung.com/smarttv/develop/getting-started/quick-start-guide.html
  - https://developer.samsung.com/smarttv/develop/tools/webapp/webapp-guide.html
  - https://developer.samsung.com/smarttv/develop/api-references/web-api-references.html

"Native application" means a properly packaged, signed, installable
Tizen Web Application — not a browser tab, not a casting solution.

Primary/initial deployment target is this one physical TV. The
architecture below is intentionally multi-TV-capable so more TVs can be
added later without redesign — but nothing here requires building for
TVs that don't exist yet.

## 3. Non-Goals

- Not a general-purpose Tizen app-store submission.
- Not a replacement for Immich — Memories is a presentation layer on top
  of it; albums/uploads/sharing stay in Immich.
- Not attempting to replicate the Frame TV's *physical* bezel hardware —
  see §5.6 on what the mat is actually trying to achieve.
- No cropping, ever, as a default behaviour (see §5.2).
- No dependency on any external cloud service — this is a local-network
  system end to end.

---

## 4. System Architecture

Three components, with a hard architectural rule: **the TV is a dumb
renderer; the Memories API is the brain.** The TV never talks to Immich and
never makes a creative decision — it asks the API "what should I show
next?" and draws exactly what it's told. This is a deliberate departure
from the original single-app design, made to support multiple TVs/users
from one control point without duplicating Immich credentials or
composition/colour logic per device.

```
                         ┌─────────────────────────┐
                         │      Memories Web        │
                         │  (React + TypeScript)    │
                         │                          │
                         │  TV list / status         │
                         │  Per-TV configuration     │
                         │  Current image + EXIF     │
                         │  Upcoming queue preview   │
                         │  Playback commands        │
                         └────────────┬─────────────┘
                                      │ HTTPS / REST + WS
                                      ▼
                         ┌─────────────────────────┐
                         │      Memories API         │
                         │  (control plane + brain)  │
                         │                           │
                         │  Users & permissions      │
                         │  TV registry & pairing    │
                         │  Configuration + versioning│
                         │  Slideshow / queue engine  │
                         │  Composition engine        │
                         │  Colour / mat engine       │
                         │  Image preparation & EXIF  │
                         │  Immich integration         │
                         │  Cache manifest              │
                         │  Command queue                │
                         │  Audit log                      │
                         │  PostgreSQL                      │
                         └────────────┬───────────────────┘
                                      │
                                      ▼
                               ┌────────────┐
                               │   Immich   │  (only Memories API talks to this)
                               └────────────┘

                                      │
                        prepared "presentations"
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
         ┌───────────┐          ┌───────────┐          ┌───────────┐
         │  TV #1    │          │  TV #2    │          │  TV #3    │
         │  Memories │          │  Memories │          │  Memories │
         │  TV client│          │  TV client│          │  TV client│
         │  (Tizen)  │          │  (Tizen)  │          │  (Tizen)  │
         └───────────┘          └───────────┘          └───────────┘
```

Only the **Memories API** holds Immich credentials. No TV, and no browser
session, ever sees an Immich API key.

---

## 5. Core Domain Concepts

### 5.1 The Presentation Object

The fundamental unit the API hands to a TV. Not "here's an image" but
"here's exactly how to show it":

```json
{
  "presentationId": "p_89231",
  "duration": 600,
  "layout": {
    "type": "two-portrait",
    "slots": [
      { "assetId": "abc", "position": "left" },
      { "assetId": "def", "position": "right" }
    ]
  },
  "background": {
    "type": "mat",
    "colour": "#D8D1C5"
  },
  "frame": {
    "shadow": "subtle",
    "bevel": "inner"
  },
  "transition": {
    "type": "crossfade",
    "duration": 2
  },
  "assets": [
    { "id": "abc", "url": "https://.../abc.jpg", "metadata": { "...": "EXIF etc." } },
    { "id": "def", "url": "https://.../def.jpg", "metadata": { "...": "EXIF etc." } }
  ]
}
```

Chosen approach for v1: **Option A** — individual pre-sized image assets
plus rendering instructions, with the TV doing the cheap compositing
(mat, shadow, layout, crossfade). This keeps the TV simple while giving the
API full creative control. The API should be architected so it *could*
later serve **Option B** (a single fully pre-rendered frame image) if
testing shows that performs better on-device — but that's a future
optimisation, not a v1 requirement.

### 5.2 Composition Engine — Never Crop

This is one of the defining features of Memories, and the rule is
absolute: **cropping is prohibited** as a default behaviour. Every
photograph is displayed in its entirety, using contain-style scaling,
aspect-ratio preservation, mats, and multi-photo layouts instead. Never
stretch either. (The only way this changes is an explicit future
user-facing setting — do not implement cropping in v1.)

The engine (now living server-side, in the Memories API) analyses
aspect ratios and picks a layout:

- **Landscape close to 16:9** → occupies most/all of the screen with an
  appropriate mat if needed.
- **Less-wide landscape** → shown fully inside the available area with a
  mat/border.
- **Portrait** → 1, 2, or 3 up depending on aspect ratio and available
  space. A single very tall portrait can stand alone; two or three
  compatible portraits can be grouped side-by-side.
- **Never force a landscape into a portrait slot** just to fill a layout.
- **Mixed-orientation albums** are grouped intelligently — e.g. a
  landscape shown alone, followed by a pair of portraits — rather than
  naively showing one image at a time regardless of orientation. A
  visually pleasing composition beats maximum pixel utilisation; don't
  create an awkward layout just to use every pixel.

Grouping should be **deterministic** for a given album/ordering/settings
combination — don't continuously rearrange while the slideshow runs. The
algorithm should weigh aspect ratio, orientation, available area, visual
balance, number of photos, and avoiding extreme size differences or
awkward whitespace.

Edge cases the engine must handle explicitly: all-landscape albums,
all-portrait albums, mixed albums, square images, panoramic and extremely
wide/tall images, very small images, an album of exactly one image (show
it alone), and a "remainder" of one, two, or three portraits at the end of
a grouping pass (don't force an extra image in just to complete a group;
one remaining portrait is shown alone with a beautiful mat).

Two landscape images should **not** automatically be placed side-by-side —
show them as separate compositions unless their aspect ratios genuinely
make a side-by-side presentation attractive.

Design the composition engine as an independent, unit-testable module.

**Implemented in Phase 4** (`api/src/composition/`): landscapes and
square images are always shown alone (the "genuinely complementary"
landscape-pairing exception above isn't implemented, so the simplest
correct behaviour — never pairing them — is used instead); square images
are bucketed with landscape rather than portrait, since the spec doesn't
prescribe either and a square photo suits a full slot better than a
narrow one. Portrait grouping thresholds were tuned against a real Immich
album, not invented numbers — the first attempt classified the most
common real phone-photo ratio (iPhone EXIF-rotated, 0.75) as "alone,"
which meant grouping never fired on real data (see TASKS.md Phase 4 for
the full story). Worth remembering for Phase 5's colour work too: verify
any perceptual/aesthetic thresholds against real photos, not assumptions.

### 5.3 Colour & Mat Engine

For every composition, server-side (Memories API):

1. Analyse the dominant/representative colour(s) of the image(s), and
   their hue/saturation/lightness characteristics.
2. Generate mat colours using real colour theory — complementary,
   analogous, split-complementary, or otherwise harmonious — not
   necessarily matching the image itself. E.g. a predominantly blue image
   might suit a warm orange/amber mat; a monochrome image suits a
   restrained neutral or complementary accent. Avoid garish colours — the
   result should feel like professional gallery framing.
3. Generate roughly **5–8 candidates** per composition, spanning:
   complementary, analogous, muted/desaturated complementary, darker
   variant, lighter variant, warm neutral, cool neutral, and near-white/
   near-black where appropriate.
4. Use a perceptually meaningful colour space for these calculations —
   prefer OKLCH/Lab over raw RGB arithmetic.
5. **Score and auto-select** the best candidate using contrast with the
   photograph, colour harmony, luminance, saturation, readability, and
   "does it compete with the photograph" — then hold that mat stable for
   the life of the composition (don't flicker mat colours every few
   seconds).
6. Offer user override modes: Automatic, Neutral, Warm, Cool, Dark,
   Light, Complementary, Analogous (plus fixed neutrals — white, black,
   walnut/wood). Persist the chosen mode per TV.

Cache colour-analysis results by asset ID/hash — never re-analyse the same
image repeatedly.

**Implemented in Phase 5** (`api/src/colour/`): candidates are built on
OKLCH hue rotation of the composition's dominant colour, not RGB
arithmetic; scoring is AUTOMATIC-only, every override mode picks a
specific candidate directly. The `WHITE`/`BLACK`/`WOOD` fixed neutrals
named above weren't actually in the `MatMode` enum until Phase 5 added
them (a gap from when the schema was first scaffolded in Phase 0, before
this section existed in detail). As in Phase 4, an aesthetic threshold
that looked fine in unit tests turned out wrong against a real photo —
the `darker` candidate's lightness floor rendered indistinguishable from
`BLACK` until raised (see TASKS.md Phase 5). Colour analysis is cached by
Immich asset id in a new `AssetColourAnalysis` table; confirmed against
the real stack that a warm regeneration is ~10x faster and produces
byte-identical mats.

### 5.4 Faux 3D Framing

The mat can optionally carry a subtle physical-gallery appearance: a
faint inner shadow, a faint outer shadow, a slight highlight along the
inner edge, a very slight tonal gradient, an optional raised/recessed
look. The effect must be **extremely subtle** — the goal is

**photograph → physical mat → shadow → screen**

not a graphic-design card or a drop-shadow-heavy web UI. Default to
restrained.

**Implemented in Phase 5**: driven by the server's `frame` field
(`tv/src/render/ImageStage.ts`), not hardcoded on the TV — a soft
box-shadow plus a faint inset top highlight per photo, and a very low-
opacity radial-gradient vignette on the mat itself. No raised/recessed
"bevel depth" variation yet; nothing in testing so far has called for it.

### 5.5 Transitions

Preferred: crossfade, very slow dissolve, extremely subtle zoom/pan where
appropriate. Avoid: spinning, flipping, sliding cards, bouncing, flashy
wipes, and excessive Ken Burns effects. The photograph stays the visual
focus, and a transition must never introduce excessive CPU/GPU load — if a
transition can't render smoothly on the actual TV, simplify it
automatically rather than letting it stutter.

### 5.6 Mats vs. the Physical Frame Bezel

The mat is a **digital, on-screen** border generated per §5.3–5.4 — it is
not an attempt to visually replicate Samsung's physical Frame bezel
hardware. Think "the mat inside a picture frame," not "a copy of the TV's
plastic edge." It should read as gallery-quality matting behind glass, on
a screen that happens to sit inside a real frame.

### 5.7 No On-Screen Metadata, No Persistent Chrome

During normal playback the screen shows **only** the composed
photograph(s) and mat — no captions, titles, dates, or overlays, ever.
This is a hard product requirement carried over unchanged from the
original design. Remote-control interaction may reveal transient
controls (see §8) that auto-hide after a short period; nothing is ever
left permanently on top of a photograph, both for aesthetic reasons and
for burn-in mitigation (§9.6).

Rich metadata (title, album, date/time, camera, lens, exposure, ISO,
focal length, and optionally GPS — see §12 open questions) is a
**Memories Web** concern, not a TV concern: it's shown in the dashboard
next to the current/next image, never burned onto the TV screen itself.

### 5.8 Playlist & Rolling Cache

Each TV has a queue of upcoming presentations maintained server-side:

```
Lounge
────────────────────────
NOW    IMG_3847
NEXT   IMG_4211, IMG_5922, IMG_6104, IMG_7321, IMG_8102
```

The TV keeps a local rolling cache (default 5–10 presentations,
configurable — see §12 for the still-open question of a byte-size cap)
and requests more from the API as it consumes them — conceptually
`GET /api/v1/tvs/{deviceId}/playlist`. This gives strong resilience:

- API unreachable for ~30 min: TV keeps advancing through its existing
  cached queue.
- API unreachable much longer: TV falls back to repeating the cached
  queue (policy-dependent, see §5.10).

Changing a TV's album in the dashboard doesn't require telling the TV
"how" to build a new slideshow — the API just regenerates that TV's queue
wholesale and the TV picks up the new playlist and transitions naturally.
The currently displayed photograph must never disappear mid-display just
because a background sync/regeneration completed.

### 5.9 TV Pairing

No typing IP addresses or credentials into the TV. Pairing code flow:

```
       MEMORIES

     Pairing code:
          7429

Open Memories on your phone/computer
and enter this code.
```

The TV displays a short numeric code; the user enters it in Memories Web,
names the TV (e.g. "Lounge"), and assigns which household users may
control it.

### 5.10 Configuration & Versioning / Offline Behaviour

Every TV's configuration (albums, interval, playback mode, mat mode, etc.)
is versioned. Saving a change in the dashboard increments the version and
triggers the API to regenerate that TV's queue and notify it via
WebSocket/SSE (falling back to polling if the TV is offline or the push
channel fails), so an offline TV is guaranteed to catch up rather than
silently miss a change.

Disconnected behaviour is configurable per TV, default
**continue/repeat cached queue**:

- Continue cached queue (consume remaining cached items, then loop).
- Repeat cached queue explicitly.
- Freeze on current image.
- Retry the API every N minutes in the background regardless of which
  mode is active.

Never show an ugly error screen and never stop the slideshow immediately
when the API/Immich disappears — keep using cached images, retry
silently, and surface connection problems only in the dashboard (or a
TV-side diagnostics view that is never shown during normal viewing).

**Related race condition found in Phase 3** (not strictly a disconnection,
but the same "TV asks before the server is ready" shape): regenerating a
TV's queue on config change calls Immich and can take a few seconds: a
TV polling right in that window gets a valid-but-empty playlist. The TV
now retries a few times before giving up rather than treating "empty"
as "nothing is or will ever be configured" — worth keeping in mind if
Phase 7's disconnected-behaviour policies get layered on top of this same
endpoint.

---

## 6. Responsibility Split

This is the definitive division of labour and should not drift over time —
new features get added to the API side, not the TV side, unless there's a
strong reason.

**Memories API owns:**
Immich integration (auth, albums, assets, thumbnails/previews, retries,
official API only — never scrape the Immich web UI, never assume
endpoints without checking current docs) · album selection & sync ·
image selection · shuffle / sequential playback · slideshow state ·
composition (§5.2) · portrait grouping · image analysis · colour analysis
(§5.3) · mat generation · EXIF extraction · image resizing/encoding
(request Immich-generated thumbnails/previews sized for the target
panel — never pull a 30–100MP original just to show it at 1920×1080) ·
queue/playlist generation · TV configuration · user permissions · TV
state · cache manifest.

**Memories TV owns only:**
rendering · local presentation/image cache · current playback timer ·
remote-control input handling · requesting more queue items · reporting
status/heartbeat · applying server instructions.

Note the TV explicitly does **not** own a settings or album-selection UI
in this architecture — that entire surface moved to Memories Web. The
TV's own on-screen surface is limited to: the pairing screen, playback
(the photograph itself), a brief transient control overlay (§8), and a
diagnostics view reachable but hidden during normal viewing.

---

## 7. Persistence

**On the Memories API** (source of truth, in PostgreSQL): server URL/
connection details for Immich, the Immich API key (secured — never
logged, never exposed to the UI, never committed to source control),
per-TV configuration and its version history, user accounts and
permissions, TV registry/pairing state, and audit log.

**On each TV** (local, resilience-only — not the source of truth): the
current configuration version and playlist it was last given, its rolling
image/presentation cache, and enough playback-position state to resume
sensibly after a restart without jarring the viewer (e.g. don't always
restart shuffle from the beginning). Use whatever secure storage Tizen
offers for anything sensitive that must live on-device; if nothing else
applies, don't fall back to plain `localStorage` for secrets.

---

## 8. Remote Control & On-Screen Interaction

The Samsung remote is the only input device — never assume a keyboard or
mouse. Minimum supported keys: Up/Down/Left/Right, Enter/Select, Back/
Return, Play/Pause if available, Next/Previous.

Suggested behaviour during playback:

- **Select/Enter** — show a brief transient control overlay (transport
  only: next/previous/pause-resume), which disappears automatically after
  a short period.
- **Left/Right** — previous/next composition.
- **Play/Pause** — pause/resume.
- **Back** — dismiss the overlay / show minimal diagnostics, rather than
  a settings menu (settings now live in Memories Web, per §6).

Controls must never be left permanently visible over a photograph.

---

## 9. Non-Functional Requirements & Engineering Constraints

Treat this as a **TV-first, always-on photographic presentation
application**, not a casual slideshow script.

1. **Resolution awareness** — detect and target the TV's actual panel
   resolution (1920×1080 for the current unit; don't hardcode assumptions
   that would break on a future 4K unit).
2. **Low resource use** — extremely low CPU/GPU usage on the TV; it runs
   24/7. Never decode more images than necessary, release image resources
   promptly, never hold an entire album's worth of decoded images in RAM,
   preload only what's actually needed next, avoid unnecessary DOM/layout
   work, and avoid animation loops while the screen is static.
3. **No memory leaks** across days/weeks of continuous operation.
4. **Graceful network-failure recovery** for both the TV↔API and API↔
   Immich links — never block slideshow playback while waiting on a
   network request.
5. **Bounded, sensible local cache** on the TV with an eviction policy
   (LRU-style or equivalent) — never let it consume unlimited storage.
6. **Correct colour-space handling** and **correct EXIF orientation
   handling** (a portrait stored with EXIF rotation must still be treated
   as portrait after orientation is applied) — prefer Immich's already-
   processed media where practical.
7. **Practical image format support**: JPEG/PNG/WebP, HEIC where
   feasible.
8. **Avoid full-resolution decoding on the TV** — the API pre-sizes
   images to the panel's actual display slot before the TV ever sees them.
9. **Smooth, subtle transitions** appropriate to a Frame TV (§5.5).
10. **Burn-in considerations** — no permanent overlays, no static status
    text, no fixed bright logos, no unnecessary persistent controls; the
    slideshow's natural content changes over time. Don't attempt to
    defeat or modify Samsung's own panel-protection mechanisms unless
    explicitly required and platform-supported.
11. **Samsung remote navigation only**, everywhere in the TV UI — no
    mouse/keyboard assumptions.
12. **10-foot UI design** on anything that *does* render on the TV
    (large text, large targets, simple navigation) — though per §6 that
    surface is now intentionally small.
13. **Automatic screen-dimension detection** rather than hardcoded
    resolutions.
14. **Persistent configuration** on both the API (source of truth) and a
    local fallback cache on the TV (§7).
15. **Logging/diagnostics** useful for development but quiet in normal
    operation, on both TV and API, sufficient to debug a TV that "just
    stopped updating" days later. Structured logs should cover Immich
    connection, API failures, asset downloads, cache operations,
    composition generation, Tizen lifecycle, and memory/resource
    problems. **Never log API keys, credentials, or tokens.**
16. **Clean separation of concerns** end-to-end: TV rendering, the
    composition engine, the colour/mat engine, the Immich client, the
    cache layer, and the API surface should all be independently
    testable modules, not entangled.

---

## 10. Technology Choices

- **Memories TV**: native Tizen Web Application (Samsung's supported app
  model for Frame TVs) — TypeScript, no framework (kept deliberately
  minimal), Vite, packaged/signed with `config.xml` and Tizen/Samsung TV
  APIs where required. Don't add large libraries without justification.
  Structure the project so most of the app can be developed and tested in
  a normal desktop browser, with Samsung-specific functionality (remote
  keys, lifecycle, device info, storage) isolated behind a
  `TizenAdapter`-style module — the rest should be testable without a
  physical TV.
  - **Tooling correction (Phase 0)**: the classic Tizen Studio IDE was the
    original plan, but its Emulator/full toolchain isn't supported on
    Apple Silicon Macs as of Tizen Studio 6.x, and the IDE itself is
    effectively deprecated in favour of editor extensions. Using the
    **"Tizen TV" VS Code extension** (`tizensdk.tizentv`, from Samsung's
    own GitHub org) instead — it's self-contained (bundles its own
    certificate manager and on-demand `sdb` fetch, no separate Tizen
    Studio install needed) and provides project creation, signed
    packaging, launch/debug on a real TV, and Wits live-reload for
    2017+ TVs. Only caveat: it's distributed on the Microsoft Marketplace,
    not Open VSX, so on VSCodium it needs sideloading the `.vsix` rather
    than a plain marketplace search.
  - `config.xml` and the app icon live in `tv/public/` (not the project
    root) so Vite's build copies them straight into `dist/` alongside the
    built `index.html`/JS bundle — `dist/` is what actually gets packaged
    and signed, not the source tree.
  - **`config.xml` must declare `<access origin="*" subdomains="true"/>`
    for any outbound `fetch`/XHR to work at all.** Found in Phase 3: the
    TV made *zero* network requests — not even a failed one logged
    anywhere — until this was added. Tizen's WAC-style access whitelist
    is unrelated to the `http://tizen.org/privilege/internet` privilege
    (already declared) and, unlike a browser's CORS block, doesn't even
    attempt a request outside the whitelist. Easy to miss because it
    fails completely silently on-device.
  - **Build/sign/install is scripted, not VSCodium-UI-driven.** The VS
    Code extension's certificate/build/launch logic turned out to be
    plain Node with zero `vscode` dependency (`@tizentv/webide-common-
    tizentv` + `@tizentv/tools`, both public npm packages, matching what
    the extension bundles). Added as real `tv/` devDependencies and
    driven from `tv/scripts/deploy.cjs` (`npm run deploy [tvIp]`) — this
    creates/reuses a certificate profile, builds+signs `tv/dist` into a
    `.wgt`, then connects/pushes/installs/launches on a real TV via `sdb`
    (auto-downloaded from `download.tizen.org` on first use). No VSCodium
    UI interaction needed for any of this, on this machine or any other
    with Node installed.
  - **Found and worked around a real bug**: the generic Tizen SDK sample
    distributor certificate these tools default to (`tizen-distributor-
    ca.cer` / `tizen-distributor-signer.p12`) expired 2022-10-27. Samsung
    ships renewed `-new` files in the same download alongside the stale
    ones; `deploy.cjs` points at those instead.
  - **Real-hardware certificate requirement — resolved.** Genuine retail
    Samsung TVs reject installs signed with only the generic Tizen
    distributor cert (`Check certificate error: Invalid certificate chain
    with certificate in signature`) — they require a Samsung-issued,
    device-ID-linked distributor certificate from a Samsung Account. User
    installed Samsung's newer "Tizen Extension" for VS Code (data dir
    `~/.tizen-extension-platform`, a more modern replacement for the
    `tizensdk.tizentv` extension above) and ran its Certificate Manager,
    logging into a real Samsung Account and registering
    `QA32LS03CBWXXY`'s device ID (`SHCLFXOSLCSYC`). That produced
    `author.p12` + `distributor.p12`, imported as the `home-development`
    profile via `tv/scripts/import-samsung-cert.cjs`. **Confirmed working
    end-to-end**: `npm run build && npm run deploy 10.10.10.80` builds,
    signs, installs (`sdb`: "install completed"), and launches (`sdb`:
    "successfully launched") — verified visually on the TV screen. Found
    one more bug along the way: the library's macOS keychain command
    (`security add-generic-password -a ${pwdFile}`) doesn't quote that
    argument, so a certificate path containing a space breaks it —
    the import script uses a no-space path as the workaround.
- **Memories Web**: React + TypeScript.
- **Memories API**: Node.js + TypeScript, Fastify, Prisma ORM/migrations,
  PostgreSQL. Chosen over alternatives mainly for stack consistency —
  Web and TV are already TypeScript, so types and tooling can be shared
  end-to-end. Scaffolded in Phase 0 (§11.2) with an initial schema
  covering `User`, `Tv`, `TvPermission`, `Album`, `Configuration`
  (versioned per §5.10), `QueueItem` (Presentations per §5.1), `Command`,
  and `AuditLog`.
  - **Docker base image: Debian-slim, not Alpine.** Found a real bug in
    Phase 2 — Alpine's musl libc has a `getaddrinfo`/DNS resolution issue
    that broke Node's `fetch()` (which undici resolves via `dns.lookup`)
    against the Immich hostname, even though the lower-level
    `dns.resolve4()` worked fine from the same container. Confirmed by
    running the identical `fetch()` call in a `node:20-slim` container,
    which worked immediately. `api/Dockerfile` uses `node:20-slim` for
    both build and runtime stages (still needs
    `apt-get install openssl` for Prisma's engine, same reason as
    before — Debian-slim doesn't ship it by default either). Prisma's
    `binaryTargets` simplified back to just `["native"]` since nothing
    runs on musl anymore.
- **Photo source**: Immich (self-hosted), accessed only by the Memories
  API, using its official API (never scrape the web UI). Verified against
  the real running instance in Phase 2, not just the OpenAPI spec (which
  is pulled from `main` and can be ahead of what's actually deployed):
  - Base path `/api`, auth via `x-api-key` header.
  - Minimum API-key permissions, confirmed via the spec's
    `x-immich-permission` annotations on each endpoint: **`album.read`,
    `asset.read`, `asset.view`** — nothing else needed.
  - `GET /albums` → array of albums directly (no wrapper).
  - Album asset listing uses `POST /search/metadata` with `albumIds`
    (technically marked deprecated in the newest spec in favour of the
    columnar `/timeline/bucket` endpoint, which is harder to consume and
    designed for timeline scrolling rather than curated-album fetching —
    used the still-functional endpoint pragmatically; revisit if Immich
    actually removes it).
  - **Real-server discrepancy found**: the live instance does not
    populate top-level `width`/`height` on assets at all (unlike the
    latest spec) — actual pixel dimensions only exist at
    `exifInfo.exifImageWidth`/`exifImageHeight`. `api/src/immich/types.ts`
    reflects the real shape, not the spec's.
  - Albums can contain videos, not just images (`type: "VIDEO"` vs
    `"IMAGE"`) — later phases (composition/queue generation) need to
    filter to images only; video support is explicitly out of scope (§14).
  - Thumbnails: `GET /assets/{id}/thumbnail?size=preview|thumbnail`,
    proxied through the Memories API (`/api/v1/assets/:id/thumbnail`) so
    neither the TV nor Memories Web ever touch Immich directly or see its
    credentials (§6).
- **Push channel**: WebSocket or SSE for TV notifications, with polling as
  a guaranteed fallback.
- **Deployment**: Docker Compose only. Memories API, Memories Web, and
  PostgreSQL are each services in a single `docker-compose.yml` — no
  Kubernetes, no per-service manual install, no managed/cloud database.
  This should be the only supported way to run the backend/web stack;
  treat it as a hosting constraint from day one, not something bolted on
  later. Immich is assumed to already be running as its own separate
  stack (Docker or otherwise) and is only ever accessed over the network
  by the Memories API. The Tizen TV client is out of scope for Compose —
  it's installed on the TV itself, not deployed as a container. Runs on
  the shared lab Docker host on `10.10.10.0/24`, which reaches the TV's
  IoT VLAN via existing firewall rules (see §12).
- **Application identifier**: Tizen doesn't accept a reverse-domain string
  as the actual package id — `tizen:application package` must be exactly
  10 alphanumeric characters. Scaffolded as:
  - `tizen:application id="zwreckmemo.Memories" package="zwreckmemo"` (the
    real, validated Tizen identifiers)
  - `widget id="http://zone.wreck/memories"` (the human-readable,
    URI-style widget id, which *does* allow the full domain — cosmetic/
    informational only, Tizen doesn't enforce uniqueness on it the way
    app stores do on a bundle id)
  Confirm `zwreckmemo` against Tizen Studio's validator in Phase 1 before
  the first signed build — this was chosen without running the actual
  tool.

---

## 11. Testing, Milestones & Acceptance

### 11.1 Testing

- **Unit tests**: aspect-ratio calculations, orientation handling,
  composition grouping, colour analysis, complementary-colour generation,
  mat scoring, slideshow ordering, shuffle/resume, cache eviction.
- **Integration tests**: Immich authentication, album retrieval, asset
  retrieval, image download, offline behaviour, album changes, TV↔API
  playlist/command flow.
- **On real hardware**: remote navigation, image rendering, portrait
  compositions, transitions, long-running playback, network failure,
  app restart, persistence, memory behaviour, install/uninstall via
  developer mode.
- **Soak test**: run continuously for at least 24 hours (preferably
  multi-day) watching for memory growth, playback degradation, image
  failures, crashes, network retry loops, and unbounded cache growth.
  This should be part of acceptance testing, not an afterthought.

### 11.2 Suggested Milestones

Build the smallest reliable version first; don't attempt every layer at
once.

1. **TV shell** — installable Tizen app on the real TV, remote input
   wired up, full-screen rendering of a mocked/static presentation.
2. **API skeleton + Immich** — Docker Compose stack (API + Postgres),
   server config, Immich auth, album listing/asset retrieval verified
   against the real instance.
3. **TV ↔ API integration** — pairing flow end-to-end, real
   `GET /playlist`, TV renders real presentations instead of mocks.
4. **Composition engine** (server-side) — landscape/portrait grouping,
   mixed-orientation handling, edge cases from §5.2.
5. **Colour/mat engine** (server-side) — dominant-colour analysis, OKLCH/
   Lab candidate generation and scoring, faux-3D framing rendered on the
   TV.
6. **Memories Web dashboard** — TV list, per-TV detail (current + EXIF +
   next queue), config form, save/push-to-TV, transport commands.
7. **Resilience** — TV rolling cache, offline/disconnected policies,
   config versioning + push (WS/SSE + polling fallback).
8. **Hardening** — soak testing, memory profiling, logging/diagnostics,
   full pass against the acceptance criteria below.

### 11.3 Acceptance Criteria

Memories is successful when:

1. The Tizen client installs and runs on `QA32LS03CBWXXY`.
2. The Memories API connects to and authenticates against the household's
   Immich instance, and only the API ever holds that credential.
3. A user can pair a TV via a short on-screen code, name it, and manage it
   from Memories Web.
4. A user can select an album (and playback settings) for a TV from the
   dashboard, and it takes effect on the TV without manual TV-side steps.
5. Photos display without cropping or stretching.
6. Images are requested/served at sensible resolutions for the panel, not
   full-resolution originals.
7. Portrait photographs are intelligently grouped (2–3 up); landscapes are
   never forced into a portrait slot.
8. Mixed-orientation albums produce attractive, non-repetitive-feeling
   compositions.
9. Mat colours are automatically generated using image-aware colour
   theory, with a working manual override.
10. Transitions are subtle and smooth on the real hardware.
11. Sequential and shuffle playback both work, with sensible resume
    behaviour after a restart.
12. The dashboard shows the current image + full EXIF, and a preview of
    what's coming next.
13. The slideshow continues through a temporary Immich/API outage using
    the local rolling cache, and recovers automatically when the API
    returns.
14. Remote-control transport (next/previous/pause/resume) works from both
    the physical Samsung remote and the dashboard.
15. No persistent controls or metadata are ever left on screen during
    normal playback.
16. The system runs for an extended period (soak-tested) without
    observable memory/resource degradation.
17. The entire backend/web stack runs from a single `docker-compose up`.
18. No external/cloud service is required anywhere in the pipeline.

---

## 12. Open Questions

Most of the original scoping questions have now been answered (folded into
the sections above from `PROJECT_OLD.md` and the architecture discussion).
Three low-stakes items were given a sensible default rather than blocking
on them — revisit if any of these don't fit:

- **Permission granularity**: defaulting to a single admin-capable user
  model for now (add roles later if a second household user needs
  restricted access) rather than building roles up front.
- **GPS/location EXIF**: originally defaulted to *never surfaced*,
  anywhere — **revisited in Phase 6**, which added a location map to the
  dashboard's per-TV detail pane (§4.2). The "TV shows none" half of that
  split still holds absolutely: GPS is fetched by Memories Web only, via
  its own on-demand `GET /assets/:id/location` call, and is never part of
  the Presentation/QueueItem data the TV receives (confirmed by
  inspecting a real `/playlist` response — no latitude/longitude/city
  anywhere in it). Only the "surfaced in the dashboard" half changed.
- **TV-side cache storage cap**: defaulting to a ~200MB soft ceiling with
  LRU eviction, on top of the item-count default (5–10 presentations,
  §5.8).

New items surfaced during Phase 0 build-out:

- **TV's long-term network home** — stay on `10.10.10.0/24` (simpler,
  what actually works for `sdb`) or move back to the IoT VLAN once
  active development winds down (the shipped app doesn't need `sdb`,
  only regular HTTPS/WS to the Memories API)? No decision needed yet.

Both remaining items from the previous revision are now settled:

- **Compose host**: the Memories stack (API + Web + Postgres) runs on the
  existing lab Docker host (general-purpose — Immich is just one of
  several services on it), which lives on `10.10.10.0/24`. Firewall rules
  already permit that host to reach the TV's IoT VLAN (`10.10.40.0/24`),
  so the Memories API and TVs can talk directly across that boundary.
- **Tizen package identifier**: intent (user-owned `zone.wreck` domain)
  confirmed; actual implementation corrected in §10 once Tizen's strict
  10-character package-id format came up during Phase 0 scaffolding.

---

## 13. Things Claude Must Not Do

- Build a normal website and call it a finished TV app.
- Put Immich credentials, or any settings/album-selection UI, on the TV —
  that surface belongs to Memories Web now (§6).
- Scrape the Immich web interface, or assume historical API endpoints
  without checking current docs.
- Download original full-resolution photographs when a properly sized
  Immich thumbnail/preview would do.
- Crop or stretch photographs, or implement cropping as a default (§5.2).
- Leave metadata or controls permanently overlaid on a photograph.
- Add flashy transitions (§5.5) or a desktop-style interface anywhere on
  the TV.
- Assume modern desktop-browser capabilities are automatically available
  on this TV, or that Tizen APIs are identical across TV generations.
- Introduce large dependencies, Kubernetes, or a managed/cloud database
  without justification — Docker Compose only (§10).
- Store API keys or other secrets in source control, logs, or the TV UI.
- Make playback block on a network request, or fail hard the moment
  Immich/the API is briefly unreachable.

## 14. Future Possibilities (don't build unless asked, but don't design against)

Multiple albums per TV, favourites, Immich search, people/location-based
collections, date-based/"on this day" collections, automatic daily/weekly
rotation, weather- or ambient-light-aware presentation, time-of-day mat
styles, video/Live Photos support, custom mat/frame presets, and
user-selectable composition rules.

---

## 15. Claude Operating Instructions

1. Treat this document as the source of truth; `PROJECT_OLD.md` is
   historical context only, useful when this document is silent on a
   detail, but never overrides it.
2. Verify current Samsung/Tizen capabilities against official Samsung
   docs, and current Immich API behaviour against official Immich docs
   (§2) — don't invent endpoints.
3. Test assumptions against the actual TV whenever possible, not only an
   emulator/browser.
4. Prefer small, independently testable modules (§9.16); keep the
   browser-based dev workflow useful for rapid iteration; keep
   Samsung-specific code isolated behind an adapter layer.
5. If a requirement can't be implemented exactly as specified on this
   TV/Tizen version, say so explicitly and implement the closest
   high-quality alternative rather than silently changing the
   requirement.
6. Optimise for reliability and visual quality over feature count.
7. Before adding a dependency, consider whether existing platform/browser
   APIs already cover it.
8. Run tests after meaningful changes.
9. Keep a README updated with setup/dev/deploy/troubleshooting
   instructions, and record significant architectural decisions as they're
   made.

---

## 16. Glossary

- **Presentation** — the full rendering instruction set for what a TV
  should show next (layout + mat + frame + transition + image assets +
  metadata).
- **Composition** — the chosen image grouping/layout (single landscape,
  2-portrait, 3-portrait).
- **Mat / bezel** — the coloured border/background surrounding the
  displayed image(s), generated by the colour engine (§5.3) — a digital
  mat, not a copy of the TV's physical bezel (§5.6).
- **Control plane** — Memories Web + Memories API (all decision-making).
- **Display plane** — Memories TV (rendering only).
