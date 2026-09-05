// Mirrors the Memories API's wire shapes (deliberately duplicated rather
// than shared across packages, same call as tv/src/api/types.ts).
export type PlaybackMode = 'SEQUENTIAL' | 'SHUFFLE';
export type MatMode =
  | 'AUTOMATIC'
  | 'NEUTRAL'
  | 'WARM'
  | 'COOL'
  | 'DARK'
  | 'LIGHT'
  | 'COMPLEMENTARY'
  | 'ANALOGOUS'
  | 'WHITE'
  | 'BLACK'
  | 'WOOD'
  | 'CORK'
  | 'COTTON';
export type MatTexture = 'wood' | 'cork' | 'cotton';
// Post-Phase-8 addition — a TV shows either its album's photos (existing
// behaviour) or its album's videos, never both (api/prisma/schema.prisma's
// DisplayMode enum).
export type DisplayMode = 'IMAGES' | 'VIDEO';
export type DisconnectedBehavior = 'CONTINUE_QUEUE' | 'REPEAT_QUEUE' | 'FREEZE';
export type CommandType = 'NEXT' | 'PREVIOUS' | 'PAUSE' | 'RESUME';

export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
  // Per-user Immich credential status — the key itself is never
  // sent to the browser, only whether one is saved and its last 4 chars
  // for display (see api/src/routes/settings.ts).
  immichConnected: boolean;
  immichKeyLast4: string | null;
  // Set on account creation or an admin-triggered reset; cleared only by
  // a successful PUT /me/password. While true, App.tsx shows a mandatory
  // change-password screen instead of the dashboard (every other route
  // also 403s server-side — see api/src/auth/middleware.ts).
  mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// Admin-only user management (routes/admin.ts) — deliberately a separate,
// smaller shape than `User`: never a password hash, an Immich key, or
// anything about a user beyond what's needed to list/manage accounts.
export interface AdminUserSummary {
  id: string;
  email: string;
  isAdmin: boolean;
  immichConnected: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

// A generated temporary password, returned exactly once by "register new
// user" or "reset password" — never retrievable again after this.
export interface TempCredential {
  user: AdminUserSummary;
  tempPassword: string;
}

export interface Configuration {
  id: string;
  tvId: string;
  version: number;
  albumIds: string[];
  intervalSeconds: number;
  playbackMode: PlaybackMode;
  matMode: MatMode;
  // VIDEO mode plays the same selected album's video assets instead of its
  // photos — `loop` only has an effect in VIDEO mode. See ConfigForm.tsx.
  displayMode: DisplayMode;
  loop: boolean;
  disconnectedBehavior: DisconnectedBehavior;
  cacheSize: number;
  maxCollageImages: number;
  collageFrequency: number;
  createdAt: string;
}

export type SlotPosition = 'full' | 'left' | 'center' | 'right' | 'grid';
export type LayoutType = 'single' | 'two-portrait' | 'three-portrait' | 'collage';

export interface PresentationAssetMetadata {
  album: string;
  filename: string;
  takenAt: string | null;
  camera: string | null;
  lens: string | null;
  exposureTime: string | null;
  fNumber: number | null;
  iso: number | null;
  focalLength: number | null;
}

export interface PresentationAsset {
  id: string;
  url: string;
  // VIDEO presentations only — the streaming-proxy URL. `url` stays the
  // thumbnail proxy, used as the poster/preview image (see TvDetailPane's
  // video badge).
  videoUrl?: string;
  metadata: PresentationAssetMetadata;
}

export interface Presentation {
  presentationId: string;
  duration: number;
  // Independent of layout.type — see api/src/playlist/presentation.ts's
  // Presentation interface for why.
  kind: 'image' | 'video';
  loop: boolean;
  layout: { type: LayoutType; slots: { assetId: string; position: SlotPosition }[] };
  background: { type: 'mat'; colour: string; texture: MatTexture | null };
  frame: { shadow: string; bevel: string };
  transition: { type: string; duration: number };
  assets: PresentationAsset[];
}

export interface TvSummary {
  id: string;
  deviceId: string;
  name: string | null;
  pairingCode: string | null;
  pairingCodeExpiresAt: string | null;
  pairedAt: string | null;
  lastSeenAt: string | null;
  paused: boolean;
  online: boolean;
  config: Configuration | null;
}

// The raw shape POST /tvs/pairing/complete returns — unlike TvSummary,
// it has no `online`/`config` (those are computed only by the list/
// detail routes) since the just-paired TV hasn't done anything yet.
export interface PairingCompleteResponse {
  id: string;
  name: string | null;
}

export interface TvDetail extends TvSummary {
  current: Presentation | null;
  next: Presentation[];
}

export interface AlbumSummary {
  id: string;
  albumName: string;
  assetCount: number;
}

// GPS EXIF (PROJECT.md §12, revisited for the dashboard's location map)
// — fetched on demand per asset, never part of Presentation/TvDetail
// (the TV must never receive this, see api/src/playlist/presentation.ts).
export interface AssetLocation {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface ConfigInput {
  albumIds?: string[];
  intervalSeconds?: number;
  playbackMode?: PlaybackMode;
  matMode?: MatMode;
  displayMode?: DisplayMode;
  loop?: boolean;
  disconnectedBehavior?: DisconnectedBehavior;
  cacheSize?: number;
  maxCollageImages?: number;
  collageFrequency?: number;
}
