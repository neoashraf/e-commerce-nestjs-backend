import { Global, Module } from '@nestjs/common';

import { CloudinaryService } from './cloudinary.service';

/**
 * Global media module. Exposes {@link CloudinaryService} to every domain (catalog product media,
 * lead attachments, exchange evidence, …) so they all upload to Cloudinary through one wrapper.
 * Marked `@Global()` so domains can inject the service without importing this module each time.
 */
@Global()
@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class MediaModule {}
