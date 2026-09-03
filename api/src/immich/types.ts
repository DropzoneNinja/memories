// Hand-picked subset of Immich's response DTOs — only the fields Memories
// actually uses, not the full OpenAPI schema. Verified against the
// official spec (immich-app/immich, open-api/immich-openapi-specs.json)
// at API version 3.2.0-rc.0 rather than assumed (PROJECT.md §2, §15.2).

export interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
  updatedAt: string;
}

export interface ImmichExif {
  make: string | null;
  model: string | null;
  lensModel: string | null;
  fNumber: number | null;
  exposureTime: string | null;
  iso: number | null;
  focalLength: number | null;
  dateTimeOriginal: string | null;
  // EXIF orientation tag as a string ("1"-"8"); see PROJECT.md §9.6 — for
  // orientation 5/6/7/8 the displayed dimensions are exifImage{Width,
  // Height} swapped, not as-is. Handle that when this actually gets used
  // (Phase 4's composition engine), not here.
  orientation: string | null;
  // Verified against a real running Immich instance (Phase 2): unlike
  // the bleeding-edge OpenAPI spec, this server does NOT populate
  // top-level width/height on AssetResponseDto at all — these EXIF
  // fields are the only reliable source of pixel dimensions.
  exifImageWidth: number | null;
  exifImageHeight: number | null;
  // GPS/location (verified field names against the real instance, Phase
  // 6). PROJECT.md §12 originally defaulted this to "never surfaced,
  // anywhere" — revisited for the dashboard's location map; still never
  // sent to the TV (see routes/albums.ts's location endpoint and
  // playlist/presentation.ts's comment on why it's excluded there).
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface ImmichAsset {
  id: string;
  originalFileName: string;
  type: 'IMAGE' | 'VIDEO';
  exifInfo?: ImmichExif | null;
}

export type ImmichThumbnailSize = 'thumbnail' | 'preview';
