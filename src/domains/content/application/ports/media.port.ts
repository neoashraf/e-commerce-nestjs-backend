/**
 * Outbound port for responsive image rendition generation (FR-CMS-050). The real media/CDN service is
 * out of scope here — `StubMediaService` returns a simple rendition map from the original URL so content
 * renders immediately (§12.7 fallback). Replace the binding when the media service is wired.
 */
export interface IMediaService {
  /** Build a renditions map ({ thumb, listing, detail }) for an image URL. */
  generateRenditions(imageUrl: string): Promise<Record<string, string>>;
}

export const MEDIA_SERVICE = Symbol('IMediaService');
