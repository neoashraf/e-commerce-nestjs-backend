import { HttpException, HttpStatus } from '@nestjs/common';

/** `410 Gone` — an admin reset/invite token that is expired or already used (FR-RBAC-007). */
export class AdminTokenExpiredException extends HttpException {
  constructor() {
    super(
      { code: 'RESET_TOKEN_EXPIRED', message: 'This link has expired or already been used.' },
      HttpStatus.GONE,
    );
  }
}
