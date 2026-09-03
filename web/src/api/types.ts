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
  | 'WOOD';
export type DisconnectedBehavior = 'CONTINUE_QUEUE' | 'REPEAT_QUEUE' | 'FREEZE';
export type CommandType = 'NEXT' | 'PREVIOUS' | 'PAUSE' | 'RESUME';

export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Configuration {
  id: string;
  tvId: string;
  version: number;
  albumIds: string[];
  intervalSeconds: number;
  playbackMode: PlaybackMode;
  matMode: MatMode;
  disconnectedBehavior: DisconnectedBehavior;
  cacheSize: number;
  createdAt: string;
}

export type SlotPosition = 'full' | 'left' | 'center' | 'right';
export type LayoutType = 'single' | 'two-portrait' | 'three-portrait';

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
  metadata: PresentationAssetMetadata;
}

export interface Presentation {
  presentationId: string;
  duration: number;
  layout: { type: LayoutType; slots: { assetId: string; position: SlotPosition }[] };
  background: { type: 'mat'; colour: string };
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

export interface ConfigInput {
  albumIds?: string[];
  intervalSeconds?: number;
  playbackMode?: PlaybackMode;
  matMode?: MatMode;
  disconnectedBehavior?: DisconnectedBehavior;
  cacheSize?: number;
}
