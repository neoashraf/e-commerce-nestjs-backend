import { ConfigService } from '@nestjs/config';

/**
 * Read a required environment variable via ConfigService and fail fast with a clear
 * error when it's unset (or blank). Used for security-critical secrets like
 * `JWT_ACCESS_SECRET` — never fall back to a hardcoded default.
 */
export function requireEnv(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${key}. Set it in .env before starting the app.`,
    );
  }
  return value;
}
