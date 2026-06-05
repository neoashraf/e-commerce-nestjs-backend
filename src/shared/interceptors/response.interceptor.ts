import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { SKIP_ENVELOPE } from '../decorators/skip-envelope.decorator';
import { Paginated } from '../dto/paginated';

/**
 * Wraps every successful response body in the SRS envelope `{ data: ... }` (SRS §7), or
 * `{ data: items, meta }` for a {@link Paginated} result. Empty bodies (204 / null /
 * undefined) pass through untouched, as do handlers marked `@SkipEnvelope()` (e.g. provider
 * webhooks that must return a raw `{ received: true }`).
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    return next.handle().pipe(
      map((payload) => {
        if (skip || payload === undefined || payload === null) return payload;
        if (payload instanceof Paginated) return { data: payload.items, meta: payload.meta };
        return { data: payload };
      }),
    );
  }
}
