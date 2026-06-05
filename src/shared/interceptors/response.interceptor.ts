import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps every successful response body in the SRS envelope `{ data: ... }` (SRS §7).
 * Empty bodies (204 / null / undefined) pass through untouched.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { data: T } | T> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<{ data: T } | T> {
    return next.handle().pipe(
      map((payload) => (payload === undefined || payload === null ? payload : { data: payload })),
    );
  }
}
