import { Injectable } from '@nestjs/common';

import { IMediaService } from '../../application/ports/media.port';

/**
 * Stub media service (FR-CMS-050; §12.7). Returns the original URL for every rendition until the real
 * media/CDN service is wired. Never throws — content still renders with the original image.
 */
@Injectable()
export class StubMediaService implements IMediaService {
  async generateRenditions(imageUrl: string): Promise<Record<string, string>> {
    return { thumb: imageUrl, listing: imageUrl, detail: imageUrl };
  }
}
