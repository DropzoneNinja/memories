// Mirrors the shape returned by the Memories API's playlist endpoint
// (api/src/playlist/presentation.ts). Deliberately duplicated rather than
// shared across packages — not worth a shared-types package yet, and this
// shape is expected to grow significantly in Phases 4-5.
// Composition engine (Phase 4, PROJECT.md §5.2): 'single' covers one
// landscape/square image or one standalone portrait; 'two-portrait' and
// 'three-portrait' are grouped portraits, left-to-right in slot order.
// 'collage' (composition addendum) is a variable-length grid of any
// orientation, still left-to-right/top-to-bottom in slot order — position
// is always 'grid' for these slots since layout is order-driven, not
// position-driven (see ImageStage.show).
export type LayoutType = 'single' | 'two-portrait' | 'three-portrait' | 'collage';
export type SlotPosition = 'full' | 'left' | 'center' | 'right' | 'grid';

export interface PresentationSlot {
  assetId: string;
  position: SlotPosition;
}

export interface PresentationAsset {
  id: string;
  url: string;
  metadata: Record<string, unknown>;
}

export interface Presentation {
  presentationId: string;
  duration: number;
  layout: { type: LayoutType; slots: PresentationSlot[] };
  background: { type: 'mat'; colour: string };
  frame: { shadow: string; bevel: string };
  transition: { type: string; duration: number };
  assets: PresentationAsset[];
}

export interface PlaylistResponse {
  configurationVersion: number;
  items: Presentation[];
}

export interface PairingResponse {
  paired: boolean;
  name?: string | null;
  pairingCode?: string;
  expiresAt?: string;
}

export type DisconnectedBehavior = 'CONTINUE_QUEUE' | 'REPEAT_QUEUE' | 'FREEZE';

// The heartbeat response (Phase 7, PROJECT.md §5.10) is the TV's
// *guaranteed* way of learning about a config change — piggybacked on the
// existing 30s heartbeat rather than a separate poll, so correctness never
// depends on the ConfigSocket WebSocket push staying connected.
export interface HeartbeatResponse {
  ok: true;
  configurationVersion: number;
  cacheSize: number;
  disconnectedBehavior: DisconnectedBehavior;
}

export interface RemoteCommand {
  id: string;
  type: 'NEXT' | 'PREVIOUS' | 'PAUSE' | 'RESUME';
  createdAt: string;
}
