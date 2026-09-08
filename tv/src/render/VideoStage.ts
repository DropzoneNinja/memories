// Video's counterpart to ImageStage (post-Phase-8 addition) — full-screen,
// contain-fit (never crop or stretch — §5.2/§5.3, same principle as
// photos): scaled up to the largest size that fits the screen while
// preserving its original aspect ratio, letterboxed/pillarboxed against a
// flat background colour where the aspect ratio doesn't match, same as any
// standard video player.
//
// Deliberately NO mat margin or faux-3D framing (unlike ImageStage,
// matStyles.ts) — a mat is a physical-print metaphor for a *photo*; it
// doesn't apply to video, and reserving a border around one just wastes
// screen space (user-reported, post-launch: videos were rendering small
// and off-center because the <video> element only had max-width/
// max-height set, not width/height — a replaced element with no explicit
// size renders at its own intrinsic/native resolution instead of filling
// its container, so object-fit: contain had nothing to scale up *to*).
//
// Deliberately a separate class from ImageStage, not a subclass:
// ImageStage rebuilds fresh <img> elements into two crossfading layers on
// every show(), which is the wrong model for video — a single persistent
// <video> element must survive pause()/resume() without being torn down
// and restarted from frame 0 (see PlaybackController.pause()/resume()'s
// pauseMedia/resumeMedia wiring).
//
// No crossfade between videos (unlike ImageStage) — a hard cut is a
// reasonable v1 simplification for a single persistent element; revisit if
// it looks jarring on real hardware.
// How far before the true end (seconds) a looping video seeks back to 0.
// Native `<video loop>` re-seeks *after* the browser treats playback as
// having reached end-of-stream, which on embedded/TV WebKit (Tizen)
// tears down and re-primes the decode pipeline — that's the visible
// pause + blank frame this constant exists to avoid. Seeking back
// slightly early means the element never hits that end-of-stream path at
// all, at the cost of trimming this many seconds off the last loop.
const LOOP_RESTART_LEAD_SECONDS = 0.15;

export class VideoStage {
  private root: HTMLDivElement;
  private video: HTMLVideoElement;
  private endedHandler: (() => void) | null = null;
  private errorHandler: (() => void) | null = null;
  private loopTimeUpdateHandler: (() => void) | null = null;

  constructor(container: HTMLElement, backgroundColor = '#0a0a0c') {
    this.root = document.createElement('div');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.overflow = 'hidden';
    this.root.style.backgroundColor = backgroundColor;

    this.video = document.createElement('video');
    // Muted/autoplay/playsInline: this is an unattended ambient display,
    // never meant to have sound (confirmed product decision) — muted also
    // avoids autoplay being blocked by browser/Tizen policy, which
    // commonly requires it for unattended playback to start at all.
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    // Explicit width/height (not just max-width/max-height) is what
    // actually makes the element fill the screen — object-fit: contain
    // then scales/centers the video *content* within that full-size box,
    // preserving aspect ratio and letterboxing as needed.
    this.video.style.position = 'absolute';
    this.video.style.inset = '0';
    this.video.style.width = '100%';
    this.video.style.height = '100%';
    this.video.style.objectFit = 'contain';
    this.root.appendChild(this.video);

    container.appendChild(this.root);
  }

  // Letterbox/pillarbox colour behind the video, not a decorative mat —
  // no vignette, no material texture, just a flat fill.
  setBackgroundColor(color: string): void {
    this.root.style.backgroundColor = color;
  }

  // Toggled by PresentationRenderer when switching between image and video
  // content — both stages' root elements live in the same container
  // simultaneously, so only the active one should ever be visible/painted.
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  // Replaces any previously-registered callback (rather than stacking
  // listeners) — PresentationRenderer calls this once per render(), and
  // the same persistent <video> element carries over across items.
  onEnded(cb: () => void): void {
    if (this.endedHandler) this.video.removeEventListener('ended', this.endedHandler);
    this.endedHandler = cb;
    this.video.addEventListener('ended', cb);
  }

  onError(cb: () => void): void {
    if (this.errorHandler) this.video.removeEventListener('error', this.errorHandler);
    this.errorHandler = cb;
    this.video.addEventListener('error', cb);
  }

  // Deliberately no poster (user-reported, post-launch): showing a static
  // thumbnail while the stream buffers, then swapping to the actual
  // decoded first frame once playback starts, read as a jarring flash —
  // two visually different images shown back to back. The root's flat
  // background colour shows through instead until the first frame is
  // ready, which is far less noticeable.
  //
  // `loop` is implemented manually (see attachLoopHandler), not via the
  // native `loop` attribute — user-reported, post-launch: native looping
  // showed a visible pause/blank-frame at every loop boundary (LOOP_
  // RESTART_LEAD_SECONDS's comment explains why).
  show(videoUrl: string, loop = false): void {
    this.video.loop = false;
    this.detachLoopHandler();
    this.video.src = videoUrl;
    if (loop) this.attachLoopHandler();
    void this.video.play().catch(() => {
      // A rejected play() promise (autoplay policy, transient decode
      // error) doesn't fire the `error` event — PresentationRenderer's
      // watchdog timer is the fallback that still advances past this
      // rather than freezing on a black frame forever (§5.10/§9.4).
    });
  }

  // Seeks back to frame 0 shortly before the video actually ends, instead
  // of letting it run to end-of-stream and rely on the native `loop`
  // attribute to restart it — see LOOP_RESTART_LEAD_SECONDS. Guards on
  // `duration` being finite: it's NaN/Infinity until metadata has loaded
  // (or never becomes finite at all for a live/streamed source, which
  // simply never triggers the early seek — no worse than native loop).
  private attachLoopHandler(): void {
    this.loopTimeUpdateHandler = () => {
      const { currentTime, duration } = this.video;
      if (Number.isFinite(duration) && currentTime >= duration - LOOP_RESTART_LEAD_SECONDS) {
        this.video.currentTime = 0;
      }
    };
    this.video.addEventListener('timeupdate', this.loopTimeUpdateHandler);
  }

  private detachLoopHandler(): void {
    if (this.loopTimeUpdateHandler) {
      this.video.removeEventListener('timeupdate', this.loopTimeUpdateHandler);
      this.loopTimeUpdateHandler = null;
    }
  }

  pause(): void {
    this.video.pause();
  }

  resume(): void {
    void this.video.play().catch(() => {});
  }

  // Stops buffering and releases the decoder — called when switching back
  // to image content. Same resource-hygiene discipline as ImageCache's
  // revokeObjectUrl: a backgrounded <video> shouldn't keep silently
  // buffering a stream nobody's watching.
  teardown(): void {
    this.video.pause();
    this.detachLoopHandler();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
