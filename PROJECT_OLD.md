# Memories — Samsung The Frame Photo Gallery

## Project overview

**Memories** is a purpose-built photo gallery / digital-art application for a Samsung The Frame TV. It replaces the built-in photo-viewing experience with a clean, elegant, low-maintenance gallery that displays photographs from a local **Immich** server.

The application is intended primarily for one physical TV:

- **TV:** Samsung The Frame 32" (2023)
- **Model:** `QA32LS03CBWXXY`
- **Native display:** 1920 × 1080, 16:9, matte display
- **Platform:** Samsung Tizen Smart TV
- **Network:** TV is on the IoT VLAN (`10.10.40.0/24`)
- **Development:** macOS
- **Primary data source:** self-hosted Immich server on the local network

Samsung identifies this model as a 2023 32" The Frame with a 1920×1080 display and Tizen OS. Samsung's current TV development model is a Tizen Web Application, packaged and signed for installation on the TV. Do not interpret "native application" as requiring a C/C++ native binary: for this project, "native" means a properly packaged, installable Samsung/Tizen TV application rather than a browser page or casting solution.

## Product vision

Memories should feel like a **digital picture frame**, not a media browser.

When displaying photographs:

- The image should be the focus.
- There should be no unnecessary UI, captions, metadata, controls, or overlays.
- Photographs must never be cropped.
- The available 16:9 screen area should be used intelligently.
- Portrait photographs should not simply be centred with large empty areas when multiple portraits can form an attractive composition.
- Borders/mats should look intentional and gallery-like.
- The application should be capable of running unattended for weeks.
- It should recover gracefully from network interruptions and application errors.
- Startup and transitions should feel polished and calm.

The aesthetic should be **minimal, premium, museum/gallery-like, and understated**.

---

# 1. Core requirements

## 1.1 Immich integration

Memories must connect directly to the user's self-hosted Immich instance over the local network.

The application must:

1. Store the Immich server URL.
2. Authenticate using an Immich API key/token as appropriate for the current Immich API.
3. Retrieve the user's available albums.
4. Allow the user to select one album.
5. Retrieve the assets/photos belonging to that album.
6. Remember the selected album.
7. Refresh album/photo information periodically without disrupting the current slideshow.
8. Handle deleted/missing assets gracefully.

Use the **official Immich API**, not HTML scraping.

Immich currently exposes an OpenAPI-based API and supports API keys with configurable permissions. The implementation must verify the exact current API endpoints and authentication mechanism against the Immich API documentation rather than hard-coding assumptions from old versions.

Official references:
- Immich API documentation: https://api.immich.app/
- Immich API overview: https://docs.immich.app/api/

### Security

The API key is sensitive.

Do not:

- hard-code it into source code
- commit it to Git
- place it in public configuration files
- display it in logs
- expose it unnecessarily to the UI

Prefer the minimum Immich API permissions necessary to:

- list/view albums
- list/view album assets
- retrieve image thumbnails/previews

The application should provide a configuration screen for entering the key.

---

# 2. Album selection

On first launch, Memories should present a simple setup flow:

1. Enter/configure Immich server URL.
2. Enter API key.
3. Test connection.
4. Retrieve albums.
5. Select an album.
6. Configure slideshow preferences.
7. Begin displaying photographs.

The main settings screen should also allow changing the selected album later.

The album selector must be designed for a TV remote and a 10-foot viewing distance.

Album selection should show:

- album name
- optionally number of photos
- optionally a representative thumbnail

Do not show unnecessary Immich metadata.

---

# 3. Slideshow

The slideshow must support:

### Timing

Configurable display duration.

Initial suggested options:

- 10 seconds
- 30 seconds
- 1 minute
- 2 minutes
- 5 minutes
- 10 minutes
- 30 minutes
- 1 hour

The implementation should make this configuration easy to extend.

### Ordering

Support:

- Sequential
- Random / Shuffle

The chosen mode must persist across application restarts.

### Resume position

Memories must remember where the user was in the album.

For sequential playback, persist the current/next asset position.

For shuffle playback, persist enough state to avoid unnecessarily restarting from the beginning after an application restart.

The exact persistence mechanism should be appropriate to Tizen and robust against application termination.

---

# 4. Image presentation

## 4.1 Never crop

**Cropping is prohibited.**

Every photograph must be displayed in its entirety.

The composition engine must use:

- contain-style scaling
- aspect-ratio preservation
- mats/borders
- multiple-photo layouts

rather than cropping.

The only exception would be an explicit future user setting that changes this requirement. Do not implement cropping in the initial version.

## 4.2 Image dimensions

The target display is 1920×1080.

Images should be requested/transformed by the server to an appropriate resolution so the TV does not have to decode enormous original camera files.

Do not download a 30–100 MP original merely to display it on a 1920×1080 screen.

The application should prefer Immich-generated thumbnails/previews or an appropriate image transformation endpoint.

The exact Immich endpoint and query parameters must be confirmed against the current API.

The TV should perform only the final compositing/scaling required for presentation.

## 4.3 EXIF orientation

The application must correctly handle image orientation.

A portrait image that is stored with EXIF orientation must still be treated as portrait after orientation is applied.

Prefer Immich's processed media where possible because Immich already handles image processing and orientation.

---

# 5. Intelligent composition engine

This is one of the defining features of Memories.

The application should not treat every photo as a separate full-screen slide.

It should analyse the aspect ratios of the photographs and select an appropriate composition.

## 5.1 Landscape

A landscape photograph whose aspect ratio is close to 16:9 should normally occupy most/all of the screen, with an appropriate mat if required.

A less-wide landscape photograph should be displayed completely inside the available area with a mat/border.

Never stretch.

Never crop.

## 5.2 Portrait

Portrait photographs should use the screen efficiently.

Depending on the photographs available, the engine should choose:

- one portrait
- two portraits side-by-side
- three portraits side-by-side

The choice should be based primarily on aspect ratio and available visual space.

Examples:

- One very tall portrait can be displayed alone.
- Two portrait photographs with compatible proportions can be displayed together.
- Three narrower portrait photographs can be displayed together.

The system must **never force a landscape photograph into a portrait slot simply to fill the layout**.

## 5.3 Mixed orientation albums

Albums may contain:

- landscape
- portrait
- square
- unusual aspect-ratio photographs

The composition engine should intelligently group photographs.

Examples:

### Example A

Landscape image:

`[              LANDSCAPE              ]`

### Example B

Two portraits:

`[  PORTRAIT  ] [  PORTRAIT  ]`

### Example C

Three portraits:

`[ PORTRAIT ] [ PORTRAIT ] [ PORTRAIT ]`

### Example D

Landscape followed by portraits:

`[             LANDSCAPE             ]`
then
`[ PORTRAIT ] [ PORTRAIT ]`

The grouping should be generated dynamically.

Do not create awkward layouts merely to use every pixel.

A visually pleasing composition is more important than maximum pixel utilisation.

## 5.4 Grouping rules

The composition engine should be deterministic.

Given the same album ordering and composition settings, it should produce the same grouping.

Do not continuously rearrange photographs while the slideshow is running.

The grouping algorithm should consider:

- aspect ratio
- orientation
- available screen area
- visual balance
- number of photos
- avoiding extreme size differences
- avoiding awkward whitespace
- keeping related/grouped photographs visually balanced

Design the composition engine as an independent module with unit tests.

---

# 6. Mats / inner bezels

The area surrounding a photograph is a major visual component of Memories.

The application should support intelligent mat/border colours.

## 6.1 Automatic colour analysis

For each displayed composition:

1. Analyse the photograph(s).
2. Determine representative/dominant colours.
3. Determine useful hue/saturation/lightness characteristics.
4. Generate several visually appropriate mat colours.

The mat does **not** need to match the image.

It should often be complementary, analogous, split-complementary, or otherwise colour-theoretically harmonious.

For example:

- predominantly blue image → warm orange/amber mat may work
- predominantly green image → muted red/burgundy or warm neutral may work
- predominantly orange image → blue/blue-grey may work
- monochrome image → restrained neutral or complementary accent

Avoid garish colours.

The result should feel like professional gallery framing.

## 6.2 Mat candidates

Generate approximately 5–8 candidates per composition.

Candidates should include combinations of:

- complementary colour
- analogous colour
- muted/desaturated complementary colour
- darker variant
- lighter variant
- warm neutral
- cool neutral
- near-white/near-black where appropriate

Use colour-space calculations appropriate for perceptual colour selection. Consider OKLCH/Lab rather than relying exclusively on RGB arithmetic.

## 6.3 Automatic selection

The system should automatically select the most aesthetically appropriate candidate.

A scoring function should consider:

- contrast with the photograph
- colour harmony
- luminance
- saturation
- readability of the photograph
- gallery aesthetic
- avoiding excessive brightness
- avoiding colours that compete with the photograph

The selected mat should be stable for the life of that composition.

Do not change mat colours every few seconds.

## 6.4 User override

The user should be able to choose:

- Automatic
- Neutral
- Warm
- Cool
- Dark
- Light
- Complementary
- Analogous

Potentially expose the generated individual colours as advanced options later.

Remember the user's preferred mat mode.

---

# 7. Faux 3D framing

The mat can optionally have a subtle physical-gallery appearance.

Consider supporting:

- subtle inner shadow
- subtle outer shadow
- slight highlight along the inner edge
- very slight tonal gradient
- optional raised/recessed appearance

The effect must be extremely subtle.

It should look like:

**photograph → physical mat → shadow → screen**

not like a graphic-design card or drop-shadow-heavy web UI.

The default should be restrained.

---

# 8. Transitions

Transitions should be subtle.

Preferred:

- crossfade
- very slow dissolve
- extremely subtle zoom/pan where appropriate

Avoid:

- spinning
- flipping
- sliding cards
- bouncing
- flashy wipes
- excessive Ken Burns effects

The image should remain the visual focus.

Transitions must not introduce excessive CPU/GPU load.

If a transition cannot be rendered smoothly on the target TV, simplify it automatically.

---

# 9. TV remote control

The Samsung remote is the primary input device.

All interaction must work without a keyboard or mouse.

Support at minimum:

- Up / Down / Left / Right
- Enter / Select
- Back / Return
- Play/Pause if available
- Next
- Previous

Suggested behaviour:

### During slideshow

- **Select/Enter:** show controls briefly
- **Left:** previous composition
- **Right:** next composition
- **Play/Pause:** pause/resume
- **Back:** return to album/settings UI

Controls should disappear automatically after a short period.

Do not leave permanent controls over photographs.

The application must correctly implement Samsung/Tizen key handling.

---

# 10. User interface

The UI should be designed for:

- 1920×1080
- 16:9
- 10-foot viewing
- Samsung remote
- large readable text
- large focus targets
- simple navigation

Avoid desktop-style UI.

Avoid tiny controls.

Avoid dense menus.

## Main screens

### A. Setup

- Immich server
- API key
- connection test
- album selection
- slideshow configuration

### B. Album selection

A visually attractive list/grid of albums.

### C. Settings

Suggested categories:

**Gallery**
- Selected album
- Sequential / Random
- Display duration
- Resume position

**Presentation**
- Automatic / manual mat style
- Mat style
- Shadow/framing effect
- Transition

**Immich**
- Server URL
- API key
- Refresh interval
- Clear credentials

**Diagnostics**
- Connection status
- Cached image count
- Last successful sync
- Current asset
- Application version

Do not expose diagnostics during normal viewing.

---

# 11. Caching and offline operation

This is critical.

Memories must continue working when Immich is temporarily unavailable.

The application should maintain a local cache containing:

- album metadata
- asset IDs
- ordering
- downloaded display-ready images
- composition information
- slideshow position

## Cache strategy

The application should:

1. Synchronise album metadata.
2. Determine which images are needed.
3. Download display-ready images.
4. Store them locally.
5. Preload the next image/composition.
6. Continue displaying cached content if Immich becomes unavailable.
7. Retry the server periodically.
8. Update the cache without interrupting playback.

## Cache size

Implement an LRU-style or otherwise bounded cache.

Do not allow the cache to consume unlimited TV storage.

The cache size should be configurable if practical.

## Network failure

If Immich disappears:

- do not show an ugly error screen
- do not stop the slideshow immediately
- continue using cached images
- retry silently
- optionally show a small temporary status indicator only when the user opens controls/settings

---

# 12. Performance requirements

This application is intended to run continuously.

It must be designed for:

- low memory usage
- low CPU usage
- minimal GPU load
- no memory leaks
- smooth transitions
- predictable resource usage

Important rules:

- Never decode more images than necessary.
- Release image resources promptly.
- Do not keep an entire large album of decoded images in RAM.
- Preload only what is necessary.
- Prefer server-side resizing.
- Avoid repeatedly analysing the same image.
- Cache image analysis results.
- Avoid unnecessary DOM/layout work.
- Avoid animation loops when the screen is static.

The app should be tested by leaving it running for extended periods.

A 24-hour soak test should be part of acceptance testing.

---

# 13. Server-side image processing

The TV should receive images already appropriate for its display.

Immich already generates thumbnails and previews and supports configurable thumbnail/preview resolution and format.

Use those capabilities where possible rather than downloading original assets.

The target should generally be around the display's native resolution, subject to the selected composition.

For example:

- 1920×1080 landscape display target
- approximately 1080×1920 source-equivalent target for a portrait that will be scaled appropriately
- lower resolution where the image's displayed size is smaller

Do not unnecessarily request enormous images.

Where possible, determine the final display slot first and request the smallest suitable Immich-generated image that provides high-quality rendering.

The exact implementation must be based on the current Immich API rather than assumptions about historical endpoints.

---

# 14. Persistent configuration

Persist:

- Immich server URL
- API key securely where possible
- selected album ID
- selected album name as cached display metadata
- slideshow duration
- playback mode
- current/next asset position
- shuffle state
- mat preference
- transition preference
- framing preference
- cache settings

If Tizen provides an appropriate secure storage mechanism, use it for the API key.

Do not store secrets in localStorage if a safer platform mechanism is available.

---

# 15. Network architecture

The TV resides on:

`10.10.40.0/24`

This is the IoT VLAN.

The application must assume that network access to the Immich server may be restricted by VLAN/firewall rules.

Do not hard-code the Immich IP address.

The server URL must be configurable.

The application should provide a clear connection test so firewall/DNS/API problems can be diagnosed.

Prefer HTTPS when available.

If the local environment intentionally uses HTTP, support it if Tizen security policies permit it.

---

# 16. Technology

Use the most appropriate officially supported Samsung TV/Tizen approach.

The default recommendation is:

- Tizen Web Application
- TypeScript
- React if it provides a clear benefit
- CSS
- Vite or another appropriate build tool
- Samsung Tizen TV packaging
- `config.xml`
- Tizen/Samsung TV APIs where required

Do not add large libraries without justification.

The final application must be packaged as an installable Samsung TV application.

Samsung documentation confirms that Smart TV applications can be developed as web applications using HTML/CSS/JavaScript and Samsung/Tizen APIs. Samsung also provides a React-based Tizen Web Application development workflow.

Official references:

- Samsung Smart TV development: https://developer.samsung.com/smarttv/develop
- Samsung TV application quick start: https://developer.samsung.com/smarttv/develop/getting-started/quick-start-guide.html
- Samsung React/Tizen web application guide: https://developer.samsung.com/smarttv/develop/tools/webapp/webapp-guide.html
- Samsung TV Web APIs: https://developer.samsung.com/smarttv/develop/api-references/web-api-references.html

Before choosing a framework/version, verify compatibility with the actual `QA32LS03CBWXXY` TV and its installed Tizen firmware.

---

# 17. Tizen deployment

Development will occur on a Mac.

The user has physical access to the target TV and can:

- enable Developer Mode
- place the TV on the IoT VLAN
- provide the TV IP address
- connect the Mac to the appropriate network
- deploy/debug applications on the TV

Claude should provide scripts/documentation for:

- development build
- production build
- package/signing
- installation
- debugging
- removing/reinstalling the app

The application must be signed using the appropriate Samsung/Tizen developer certificate.

Do not assume the application can simply be opened in the TV's web browser and considered complete.

The target is an installed Tizen application.

---

# 18. Development workflow

The project should be structured so that most of the application can be developed and tested on macOS in a normal browser while Samsung-specific functionality is isolated.

Suggested architecture:

```text
memories/
├── src/
│   ├── api/
│   │   └── immich/
│   ├── cache/
│   ├── composition/
│   ├── colour/
│   ├── playback/
│   ├── presentation/
│   ├── persistence/
│   ├── tizen/
│   ├── ui/
│   ├── types/
│   └── main/
├── public/
├── tests/
├── scripts/
├── tizen/
├── config.xml
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── PROJECT.md
```

The exact structure can differ if Claude determines a better architecture.

The important principle is separation of concerns.

---

# 19. Suggested modules

## ImmichClient

Responsible for:

- authentication
- albums
- album assets
- thumbnails/previews
- API errors
- retries

It should not know anything about the UI.

## ImageCache

Responsible for:

- disk/local cache
- cache eviction
- downloads
- preloading
- offline operation

## CompositionEngine

Input:

```text
assets + screen dimensions + presentation preferences
```

Output:

```text
composition
```

A composition should describe:

- asset ID
- slot
- x
- y
- width
- height
- orientation
- mat
- shadow/framing
- transition metadata

## ColourAnalyzer

Responsible for:

- dominant colours
- colour statistics
- OKLCH/Lab conversion
- complementary/analogous generation
- mat scoring

Cache the result by asset ID/hash.

## SlideshowController

Responsible for:

- current composition
- next composition
- previous composition
- timing
- sequential mode
- shuffle
- resume position
- pause/resume

## TizenAdapter

Responsible for:

- remote keys
- Tizen-specific APIs
- app lifecycle
- device information
- storage capabilities
- deployment-specific functionality

The rest of the application should be testable without a TV.

---

# 20. State model

The application should have explicit application states.

Example:

```text
BOOT
  ↓
LOAD_CONFIG
  ↓
TEST_CONNECTION
  ↓
LOAD_ALBUMS
  ↓
ALBUM_SELECTION
  ↓
SYNC_ALBUM
  ↓
BUILD_COMPOSITIONS
  ↓
PRELOAD
  ↓
SLIDESHOW
  ↕
PAUSED
  ↓
SETTINGS
```

Error conditions should return gracefully to the most appropriate state.

---

# 21. Album synchronisation

Do not redownload every photograph every time the application starts.

Maintain a local record containing at least:

- asset ID
- album ID
- ordering
- dimensions/aspect ratio
- orientation
- cached image path
- image hash/version if available
- last synchronised time
- composition-analysis information

When syncing:

1. Fetch current album contents.
2. Compare against local metadata.
3. Add new assets.
4. Remove assets that no longer exist in the album.
5. Keep cached images that are still valid.
6. Download new/changed assets.
7. Update the playback model.

The currently displayed photograph must not suddenly disappear simply because a background sync completed.

---

# 22. Image grouping edge cases

The composition engine must handle:

- all-landscape albums
- all-portrait albums
- mixed albums
- square images
- panoramic images
- extremely tall images
- extremely wide images
- very small images
- duplicate aspect ratios
- one remaining portrait
- two remaining portraits
- three remaining portraits
- albums containing only one image

Examples:

### One image

Display it alone.

### Two landscape images

Do not automatically place them side-by-side. Normally display them as separate compositions unless their aspect ratios make a side-by-side presentation genuinely attractive.

### Three portraits

A three-up composition is preferred when appropriate.

### One portrait remaining

Display it alone with a beautiful mat rather than forcing another image into the layout.

---

# 23. Burn-in / display considerations

The application will potentially remain visible for long periods.

Avoid:

- permanent UI overlays
- static status text
- fixed bright logos
- unnecessary persistent controls

Controls should disappear completely during normal playback.

The slideshow should naturally change screen content over time.

Do not attempt to defeat or modify Samsung's own panel protection mechanisms unless explicitly required and supported by the platform.

---

# 24. Logging and diagnostics

Logging should be useful during development but quiet during normal operation.

Include structured logs for:

- Immich connection
- API failures
- asset downloads
- cache operations
- composition generation
- Tizen lifecycle
- memory/resource problems

Never log:

- API keys
- credentials
- sensitive tokens

Provide a diagnostics screen that can show:

- Immich connection status
- selected album
- album asset count
- cached asset count
- current asset
- next asset
- cache size
- last sync
- last error
- application version

---

# 25. Testing

Testing should include:

## Unit tests

- aspect-ratio calculations
- orientation handling
- composition grouping
- colour analysis
- complementary colour generation
- mat scoring
- slideshow ordering
- shuffle/resume
- cache eviction

## Integration tests

- Immich authentication
- album retrieval
- asset retrieval
- image download
- offline behaviour
- album changes

## TV testing

On the actual Samsung TV:

- remote navigation
- image rendering
- portrait compositions
- transitions
- long-running playback
- network failure
- application restart
- persistence
- memory behaviour
- installation/uninstallation
- developer-mode deployment

## Soak test

Run the application continuously for at least 24 hours.

Preferably perform a multi-day test.

Monitor for:

- memory growth
- playback degradation
- image failures
- crashes
- network retry loops
- cache growth

---

# 26. Acceptance criteria

Memories is considered successful when:

1. It installs and runs as a Samsung Tizen TV application on `QA32LS03CBWXXY`.
2. It connects to the user's local Immich server.
3. It authenticates securely.
4. It lists Immich albums.
5. The user can select an album with the Samsung remote.
6. The selected album is remembered.
7. Photos display without cropping.
8. Images are retrieved at sensible display resolutions.
9. Portrait photographs are intelligently grouped.
10. Landscape photographs are never forced into portrait layouts.
11. Mixed-orientation albums produce attractive compositions.
12. Mat colours are automatically selected using image-aware colour theory.
13. The user can override mat behaviour.
14. Subtle transitions work smoothly.
15. Sequential and random playback work.
16. Playback duration is configurable.
17. Playback position survives application restart.
18. Photos are cached locally.
19. The slideshow continues during temporary Immich/network outages.
20. The app recovers automatically when the server returns.
21. Remote control navigation works correctly.
22. There are no persistent controls over photographs.
23. The application can run for extended periods without obvious memory/resource degradation.
24. The UI is appropriate for a 10-foot TV experience.
25. No unnecessary external/cloud service is required.

---

# 27. Things Claude must NOT do

Do not:

- build this as a normal website and call it finished
- require a phone/tablet as the controller
- use an external cloud image-hosting service
- scrape the Immich web interface
- download original full-resolution photographs unnecessarily
- crop photographs
- stretch photographs
- permanently overlay metadata
- add flashy transitions
- create a desktop-style interface
- assume a modern desktop browser's capabilities are automatically available on this TV
- assume current Immich API endpoints without verifying them
- assume Tizen APIs are identical across TV generations
- introduce large dependencies without justification
- store the API key in source control
- make the application dependent on an active internet connection
- block slideshow playback while waiting for a network request

---

# 28. Future possibilities

Do not implement these unless requested, but architect the application so they could be added later:

- multiple albums
- favourites
- Immich search
- people/location-based collections
- date-based collections
- automatic daily/weekly albums
- weather-aware presentation
- time-of-day mat styles
- ambient-light-aware presentation
- multiple TV profiles
- remote web/mobile administration
- automatic album rotation
- video support
- Live Photos / motion photos
- artwork mode integration
- custom mat presets
- custom frame/bezel profiles
- user-selectable composition rules

---

# 29. Important implementation principle

**Build the smallest reliable version first.**

Recommended development milestones:

### Milestone 1 — TV shell

- Tizen application
- install on real TV
- remote control
- basic UI
- full-screen rendering

### Milestone 2 — Immich

- server configuration
- API key
- album list
- album selection
- basic single-image slideshow

### Milestone 3 — Image pipeline

- server-side appropriate image retrieval
- caching
- preload
- offline support

### Milestone 4 — Composition

- landscape handling
- portrait handling
- mixed orientation
- grouping algorithm

### Milestone 5 — Gallery presentation

- mats
- colour analysis
- colour theory
- subtle shadows
- transitions

### Milestone 6 — Persistence

- settings
- playback position
- shuffle state
- cache state

### Milestone 7 — Hardening

- error handling
- long-running testing
- memory optimisation
- network interruption testing
- deployment documentation

Do not attempt to build every feature simultaneously.

---

# 30. Definition of "beautiful"

The application should pass a simple visual test:

> If somebody walked into the room and saw Memories running, they should think the TV is displaying a professionally framed photograph — not running an application.

The UI should disappear when viewing photographs.

The mat should feel physical.

The composition should feel deliberate.

The photograph should remain the star.

The technology should be invisible.

---

# 31. Claude operating instructions

When working on this project:

1. Read `PROJECT.md` before making architectural decisions.
2. Treat this document as the source of truth unless the user explicitly changes a requirement.
3. Verify current Samsung/Tizen capabilities against official Samsung documentation.
4. Verify current Immich API behaviour against official Immich documentation.
5. Do not invent API endpoints.
6. Test assumptions against the actual TV whenever possible.
7. Prefer small, testable modules.
8. Keep the browser development environment useful for rapid iteration.
9. Keep Samsung-specific code isolated.
10. Document any platform limitation discovered during development.
11. If a requirement cannot be implemented exactly on this TV/Tizen version, explain the limitation and implement the closest high-quality alternative rather than silently changing the requirement.
12. Optimise for reliability and visual quality rather than feature count.
13. Keep the application usable when the Immich server is temporarily unavailable.
14. Treat the API key as a secret.
15. Never commit credentials or generated secrets.
16. Before adding a dependency, consider whether the functionality can be implemented using existing platform/browser APIs.
17. Run tests after meaningful changes.
18. When possible, test on the physical `QA32LS03CBWXXY`, not only an emulator/browser.
19. Keep `README.md` updated with setup, development, deployment, and troubleshooting instructions.
20. Record important architectural decisions in an `ARCHITECTURE.md` or equivalent project documentation.

---

## Current known hardware facts

Samsung's Australian specifications identify the target TV as:

- Model: `QA32LS03CBWXXY`
- 32-inch
- 1920 × 1080
- 16:9
- 50 Hz native refresh rate
- Matte anti-reflection display
- Tizen OS
- Samsung The Frame / LS03C series
- 2023 model

These facts should be treated as hardware constraints for the initial implementation.

---

## Project name

**Memories**

Suggested package/application identifier should use a stable reverse-domain identifier chosen during project setup, rather than using an arbitrary package name.

Example:

```text
com.<developer-domain>.memories
```

Choose the final identifier before the first signed production package because changing application identity later can complicate updates.

---

## Final product summary

Memories is a local-network, Immich-powered digital photo frame for Samsung The Frame.

It should:

**Connect → Select Album → Cache → Compose → Frame → Display → Remember → Repeat**

with no cloud dependency, no cropping, intelligent portrait/landscape layouts, gallery-quality mats, subtle visual effects, and reliable unattended operation.
