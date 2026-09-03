// Mirrors the shape returned by the Memories API's playlist endpoint
// (api/src/playlist/presentation.ts). Deliberately duplicated rather than
// shared across packages — not worth a shared-types package yet, and this
// shape is expected to grow significantly in Phases 4-5.
// Composition engine (Phase 4, PROJECT.md §5.2): 'single' covers one
// landscape/square image or one standalone portrait; 'two-portrait' and
// 'three-portrait' are grouped portraits, left-to-right in slot order.
export type LayoutType = 'single' | 'two-portrait' | 'three-portrait';
export type SlotPosition = 'full' | 'left' | 'center' | 'right';

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

export interface RemoteCommand {
  id: string;
  type: 'NEXT' | 'PREVIOUS' | 'PAUSE' | 'RESUME';
  createdAt: string;
}
