import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  retry_after?: number;
}

const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  423: 'LOCKED',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/** Formats all errors into the SRS error envelope `{ error: { code, message, details } }` (SRS §7). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'Internal server error.' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        body = { code: DEFAULT_CODE_BY_STATUS[status] ?? 'ERROR', message: resp };
      } else {
        const r = resp as Record<string, unknown>;
        if (Array.isArray(r.message)) {
          // class-validator failures
          body = {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed.',
            details: r.message,
          };
        } else {
          // Pass through any extra contract fields the thrower set (e.g. `from`/`to` on an
          // INVALID_TRANSITION, `details`, `retry_after`) while stripping Nest's default keys.
          const { statusCode: _sc, error: _err, message: _msg, code: _code, ...rest } = r;
          body = {
            code: (r.code as string) ?? DEFAULT_CODE_BY_STATUS[status] ?? 'ERROR',
            message: (r.message as string) ?? exception.message,
            ...rest,
          };
        }
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({ error: body });
  }
}
