import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE = 'skipEnvelope';

/**
 * Marks a route handler whose response must NOT be wrapped in the `{ data }` envelope —
 * e.g. gateway/provider webhooks that expect a raw body like `{ "received": true }`,
 * or browser redirects.
 */
export const SkipEnvelope = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_ENVELOPE, true);
