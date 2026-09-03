Today 2:59 PM
I have a new project. I just bought a Samsung The Frame 32 inch TV. I do not like the Photo viewing app on it and would like to build a custom one that can read from my local imgur server. Could you please create the PROJECT.md file to tell claude what we want to build. The project is to build a native application to run on the tv and should allow the selection of albums from imgur to display. If needed the image should be resized to be viewed perfectly on the screen. It should have a selection of inner bezels (colour wise) that are optimized to the overall color of the image (not necessarily the same color, nbut complimentary, such as the color wheel?). If the images are portrait, then 2 or three should be displayed to use the space effectively. Add any information you think is crucial for claude.. Also please ask any questions you need to write the project file.

Absolutely. Before I write PROJECT.md, I want to nail down a few architectural decisions because this is a native Samsung TV application, and those choices will materially affect what I tell Claude to build.

Questions
What exact model/year is your 32" The Frame?
If you can give me the model number from Settings → Support → About, that would be ideal. Samsung's TV application platform and capabilities vary by model/year.

What do you mean by your "local Imgur server"?
Is this:

a self-hosted application/API that is Imgur-compatible,
an actual local mirror/cache of your Imgur account,
or something else?

If it has an API, I'd like Claude to build against that API rather than scraping the web interface.

Network access: should the TV connect directly to the server over your LAN, e.g.
http://10.x.x.x/...

or will the server be accessed through HTTPS?

Authentication: does the local Imgur server require authentication/API keys, or should the TV be able to access it anonymously?
Albums: how should selection work?
Choose an album and continuously display its images
Multiple albums combined into one slideshow
Both
Also perhaps a "Favorites/All Photos" option?
Slideshow behaviour: what do you want?
Fixed interval, e.g. every 5/10/30 minutes
Configurable interval
Random/shuffle
Sequential
Remember where it left off?
Transitions: do you want things like cross-fade, slide, Ken Burns/slow zoom, etc.?
For a Frame TV I'd lean toward subtle transitions rather than flashy ones.

Portrait images: your idea of displaying 2–3 portraits is good. Should Claude dynamically choose between:

1 landscape
2 portraits side-by-side
3 portraits side-by-side

based on the available images and their aspect ratios?

Mixed orientations: if an album contains landscape + portrait images, should the application intelligently create compositions, e.g. one landscape by itself and pairs/groups of portraits?
Bezels: I'm imagining something more sophisticated than simply picking a colour:
Analyse the dominant/average colours in the displayed image(s)
Generate complementary/analogous colours using colour theory
Offer perhaps 5–8 automatically generated bezel choices
Include neutral choices such as white, black, walnut/wood, etc.
Remember the user's chosen bezel preference

Is that what you have in mind?

Actual Samsung bezel/frame: should the application attempt to make the inner bezel visually resemble the physical Frame TV bezel, or are you primarily talking about the coloured mat/border immediately surrounding the photograph?
Image sizing: should the application never crop photographs, preferring letterboxing/matting, or are you happy for it to intelligently crop where doing so produces a better composition?
Metadata: would you like optional information such as:
photo title
album name
date taken
EXIF information

Or should the display be completely clean with no text?

Remote control: should the Samsung remote allow:
album selection
next/previous photo
pause/play
bezel selection
settings

I'd recommend yes.

Settings: should configuration be stored locally on the TV, including server URL, credentials, selected albums, slideshow timing, bezel preferences, etc.?
Offline/cache: this is important for a TV. Should the application maintain a local cache of images so that:
photos don't disappear if the server temporarily goes offline
startup is fast
the slideshow can continue during a short network outage?
Image processing: are you happy for the server to provide appropriately sized images, with the TV doing final scaling/compositing? This would substantially reduce network traffic and TV memory usage.
Development environment: are you intending Claude to build this on your Mac, and do you already have Samsung/Tizen developer tooling installed?
Distribution: is this purely for your own TV, or do you eventually want to be able to install it on other Samsung TVs?
Finally, what would you like the project called?
I can suggest something like FrameGallery, FrameView, ArtFrame, GalleryFrame, or LocalFrame.
One other thing I'd strongly recommend

I'd like PROJECT.md to tell Claude to treat this as a TV-first photographic presentation application, rather than simply an image slideshow.

That means I'd specify things such as:

4K/Full-HD awareness depending on the TV
extremely low CPU/GPU usage
preloading the next image
avoiding memory leaks during days/weeks of continuous operation
graceful recovery from network failures
caching and eviction policies
colour-space handling
EXIF orientation
JPEG/PNG/WebP/HEIC support where practical
avoiding unnecessary image decoding at full original resolution
smooth transitions
burn-in considerations
Samsung remote navigation
10-foot UI design
no mouse/keyboard assumptions
automatic screen-dimension detection
portrait/landscape composition engine
colour-theory-based mat/bezel generation
persistent configuration
logging/diagnostics
a clean separation between TV UI, image composition, Imgur API client, cache, and image analysis

I can then make PROJECT.md much more useful to Claude than a simple feature list—it can serve as the master technical specification and implementation brief for the entire project.

Send me your answers to the 20 questions above (you can just number them, and say "use your recommendation" where you don't care), and I'll create the complete PROJECT.md ready to drop into the project.

Yes — and I think this makes the project significantly better. I've updated PROJECT.md to turn Memories into a complete multi-TV, multi-user self-hosted system.

Download the updated PROJECT.md

The new architecture

I've specified three components:

1. Memories TV

Runs natively as the Tizen application.
Displays the photographs.
Handles caching, composition, mats, transitions and remote control.
Receives configuration from the server.
Reports its status/heartbeat.

2. Memories Web

React + TypeScript.
Login/authentication.
Dashboard showing all TVs.
Add/pair TVs.
Give TVs friendly names such as Lounge, Bedroom, etc.
Select Immich albums.
Configure timing, random/sequential playback, mats, shadows, transitions, etc.
Preview what the TV will look like.
Send commands such as next, previous, pause and resume.

3. Memories API

Backend/API.
PostgreSQL.
User authentication and permissions.
TV registration.
Configuration storage.
Immich integration.
Device status.
Configuration versioning.
Command queue.
Audit logging.
One architectural change I particularly recommend

Rather than putting your Immich API key into every TV, I've specified that we should prefer the Memories backend as the control plane.

So conceptually:

                 ┌──────────────┐
                 │ Memories Web │
                 └───────┬──────┘
                         │
                         ▼
                 ┌──────────────┐
                 │ Memories API │
                 └───┬──────┬───┘
                     │      │
               ┌─────▼──┐ ┌─▼──────┐
               │Postgres│ │ Immich │
               └────────┘ └────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
        TV #1      TV #2      TV #3

This also gives us a really nice capability: configuration push.

If you change Lounge from:

Family → Holidays
10 minutes → 30 minutes
Automatic mat → Dark mat

the backend saves the configuration, increments its version and tells that particular TV to update. The TV can then download the new configuration and transition cleanly to the new album.

I've specified WebSocket/SSE for immediate updates plus polling as a fallback, so an offline TV doesn't lose configuration changes. Samsung's Tizen platform supports the underlying web application model and remote-control interaction we're targeting.

I've also added TV pairing, so you don't have to type IP addresses or credentials into every television:

TV displays:

       MEMORIES

     Pairing code:
          7429

Open Memories on your phone/computer
and enter this code.

Then you name it Lounge, Bedroom, etc. and assign which household users can control it.

This should give us a much more polished system than simply building a photo viewer — essentially your own local equivalent of a household digital-art management system, with Immich as the photo source. 

PROJECT.md
Document
Actually, this has me thinking. Lets make the web app the controlling application more intelligent and the TV just a bit dumber. The web app would have the tvs listed on a pane on the left of the screen. When a user clicks on a tv, the config options plus what is being displayed and what is coming (with EXIF metadata) should be displayed. The user can change the albums or other options for that tv. The Tizen app then just uses the memories API to display the image/frame/etc. You could cache 5 or more) images in advance which can be repeated if there is no connection to the memories app. Thereby only memories needs to interact with Immich. What do you think of this?

I think that's a better architecture. In fact, I'd go further: make the TV essentially a thin, dumb rendering client, and make the Memories server the brain.

That gives us a much cleaner system.

Proposed architecture
                         ┌─────────────────────────┐
                         │      Memories Web       │
                         │                         │
                         │  TV list                │
                         │  Configuration          │
                         │  Current image           │
                         │  Next images             │
                         │  EXIF                    │
                         │  Preview                 │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │     Memories API        │
                         │                         │
                         │  Users                  │
                         │  TVs                    │
                         │  Config                 │
                         │  Slideshow engine       │
                         │  Composition engine     │
                         │  Colour/mat engine      │
                         │  Image preparation      │
                         │  EXIF                   │
                         │  Immich integration     │
                         │  Cache                  │
                         └────────────┬────────────┘
                                      │
                                      ▼
                               ┌────────────┐
                               │   Immich   │
                               └────────────┘

                                      │
                         prepared images/config
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
         ┌───────────┐          ┌───────────┐          ┌───────────┐
         │   TV #1   │          │   TV #2   │          │   TV #3   │
         │  Tizen    │          │  Tizen    │          │  Tizen    │
         │  CLIENT   │          │  CLIENT   │          │  CLIENT   │
         └───────────┘          └───────────┘          └───────────┘

The key difference is that the TV doesn't need to understand albums, Immich, EXIF, colour theory, composition algorithms, etc.

It just says:

"Give me what I should display next."

And the API says:

"Display this image, using this composition, this mat and these parameters."

The web application could become really nice

I envisage the main screen looking something like:

┌────────────────┬───────────────────────────────────────────────┐
│ MEMORIES       │ Lounge                                       │
│                │                                               │
│ TVs            │ ┌─────────────────────────────────────────┐ │
│                │ │                                         │ │
│ ● Lounge       │ │             CURRENT IMAGE               │ │
│   Family       │ │                                         │ │
│                │ │                                         │ │
│ ○ Bedroom      │ └─────────────────────────────────────────┘ │
│   Travel       │                                               │
│                │ Currently displaying                          │
│ ○ Study        │ Family / IMG_3847                             │
│   Nature       │ Taken: 14 Aug 2026  3:42 PM                  │
│                │ Camera: Sony A7 IV                           │
│                │ 35mm · f/2.8 · 1/500 · ISO 200              │
│                │                                               │
│                │ NEXT                                         │
│                │ ┌────────┐ ┌────────┐ ┌────────┐             │
│                │ │ image  │ │ image  │ │ image  │             │
│                │ └────────┘ └────────┘ └────────┘             │
│                │                                               │
│                │ Album: [ Family             ▼ ]              │
│                │ Interval: [ 10 minutes       ▼ ]             │
│                │ Playback: [ Random           ▼ ]             │
│                │ Mat:      [ Automatic        ▼ ]              │
│                │                                               │
│                │ [ Save / Push to TV ]                         │
└────────────────┴───────────────────────────────────────────────┘

And clicking another TV instantly changes the right-hand pane.

That would make managing several TVs really easy.

The really interesting part: the server controls the slideshow

I'd move almost all of the intelligence here.

The Memories API maintains a playback queue for every TV.

For example:

Lounge
────────────────────────
NOW
  IMG_3847

NEXT
  IMG_4211
  IMG_5922
  IMG_6104
  IMG_7321
  IMG_8102

The server has already determined:

which photographs come next
grouping of portraits
landscape/portrait composition
exact image dimensions
mat colour
shadow settings
transition
display duration
EXIF metadata

The TV doesn't have to calculate any of that.

I'd actually cache compositions, not just images

This is an important distinction.

Suppose the server determines:

Composition #184

1920 × 1080

┌──────────────────────────────────────┐
│                                      │
│  ┌────────────┐  ┌────────────┐     │
│  │            │  │            │     │
│  │ Portrait 1 │  │ Portrait 2 │     │
│  │            │  │            │     │
│  └────────────┘  └────────────┘     │
│                                      │
└──────────────────────────────────────┘

Mat: #D7D1C4
Shadow: subtle

The server could provide the TV with either:

Option A — individual images + instructions
{
  "type": "composition",
  "images": [...],
  "mat": {...},
  "layout": {...}
}

or potentially:

Option B — a completely rendered 1920×1080 frame
composition-184.jpg

I think Option A is better initially, because the TV can render the mat/shadow extremely cheaply and we retain flexibility.

But we should architect the API so we can eventually support pre-rendered compositions if testing shows that the TV performs better that way.

Five-image rolling cache

Your idea here is excellent.

I'd make the default something like 5–10 compositions, configurable.

The TV might therefore have:

LOCAL CACHE

[1] CURRENT
[2] NEXT
[3] NEXT
[4] NEXT
[5] NEXT
[6] NEXT
[7] NEXT

When it displays #1:

#1 → display
#2 → display next
#3 → standby
#4 → standby
#5 → standby
#6 → standby
#7 → standby

It then asks the server for more.

This gives us very strong resilience.

Memories server unavailable for 30 minutes

No problem.

The TV continues:

5 → 6 → 7 → 1 → 2 → 3

depending on the queue/repeat policy.

Memories server unavailable for six hours

Still potentially no problem if the cache contains enough material and the configuration allows repeating.

We can make the behaviour configurable:

When disconnected:

Continue cached queue
Repeat cached queue
Freeze current image
Retry every X minutes

I'd default to continue/repeat cached images.

This also solves the Immich API-key problem elegantly

The TVs never need to know anything about Immich.

Only:

Memories API → Immich

has access to the Immich credentials.

That's much cleaner.

The TV gets something like:

GET /api/v1/tvs/{deviceId}/playlist

and receives:

{
  "configurationVersion": 37,
  "playlistVersion": 142,
  "items": [
    {
      "id": "abc123",
      "imageUrl": "...",
      "duration": 600,
      "transition": "crossfade",
      "mat": {...},
      "layout": {...},
      "metadata": {...}
    }
  ]
}

The TV doesn't care where the photograph came from.

It just displays it.

It also makes the web application much more powerful

Because the server knows the current and upcoming queue, the web UI can show:

Currently displayed

Large image +:

filename
album
date/time
camera
lens
exposure
ISO
focal length
GPS if we decide to support it later
Coming next

Three/five thumbnails:

NEXT

┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│       │ │       │ │       │ │       │
│ IMG1  │ │ IMG2  │ │ IMG3  │ │ IMG4  │
│       │ │       │ │       │ │       │
└───────┘ └───────┘ └───────┘ └───────┘

Clicking one could potentially show its metadata.

That's a really useful household photo dashboard, rather than merely a settings page.

And configuration changes become much easier

If you change:

Album: Family → Holidays

the server doesn't have to tell the TV how to construct the slideshow.

It simply regenerates the TV's queue:

OLD QUEUE
Family
  3847
  4211
  5922
  ...

             ↓

NEW QUEUE
Holidays
  9123
  9271
  9412
  ...

The TV receives the new playlist and transitions naturally.

One thing I'd change from the previous PROJECT.md

I'd make the Memories API the authoritative brain, rather than the TV.

Specifically:

Server owns
Immich
album selection
album synchronisation
image selection
shuffle
sequential playback
slideshow state
composition
portrait grouping
image analysis
colour analysis
mat generation
EXIF
image resizing
queue generation
TV configuration
user permissions
TV state
cache manifest
playlist generation
TV owns only
rendering
local image cache
current playback timer
remote-control input
requesting more queue items
reporting status
applying server instructions

That's a much cleaner separation of responsibilities.

One further idea I'd strongly consider

I'd make the API expose a concept called a Presentation.

Rather than the TV receiving:

"Here's an image."

it receives:

"Here's a presentation."

A presentation describes exactly how something should appear:

{
  "presentationId": "p_89231",
  "duration": 600,

  "layout": {
    "type": "two-portrait",
    "slots": [...]
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
    {
      "id": "abc",
      "url": "...",
      "metadata": {...}
    },
    {
      "id": "def",
      "url": "...",
      "metadata": {...}
    }
  ]
}

That gives us a very powerful abstraction. Later, Memories could support entirely different presentation algorithms without having to rewrite the TV application.

So yes — I would change the architecture in this direction.

I think it makes Memories simpler, more reliable, easier to develop, easier to manage across multiple TVs, and considerably more powerful.

And importantly, it means the Samsung application can remain deliberately boring. 😄

The TV should be a renderer. Memories should be the brain.

I'd recommend we update PROJECT.md again to make this the definitive architecture, including the TV playlist/cache model, presentation object, server-side slideshow engine, web dashboard layout, multi-TV state model, and the distinction between control plane and display plane.

I like this. Go ahead and make the changes

It seems like I can’t do more advanced data analysis right now. Please try again later.

I wasn't able to invoke the file-editing tool, so I haven't modified PROJECT.md. I also won't retry the tool in this turn. 

