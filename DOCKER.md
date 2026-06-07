# Docker & CI/CD — backend

This document explains how to run the NestJS backend with Docker and how the
GitHub Actions pipelines work.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build (`deps` → `build` → `prod-deps` → `development` → `production`). |
| `.dockerignore` | Keeps `node_modules`, `dist`, `.env`, tests, etc. out of the build context. |
| `docker-compose.yml` | Production-like stack: PostgreSQL + migration runner + API. |
| `docker-compose.dev.yml` | Dev override: hot reload with the source bind-mounted. |
| `.github/workflows/ci.yml` | Build, unit tests, e2e (with PostgreSQL), Docker build check. |
| `.github/workflows/cd.yml` | Build & push the image to GHCR on `main` / `v*` tags. |

## Run locally

```bash
# 1. Create your env file and fill in secrets.
cp .env.example .env

# 2. Start the full stack (Postgres + migrations + API).
docker compose up --build
```

- API:     http://localhost:8000/api/v1
- Health:  http://localhost:8000/api/v1/health
- Swagger: http://localhost:8000/api/v1/docs

The `migrate` service runs `npm run migration:run` once (after Postgres is
healthy) and exits; the `api` service starts only after migrations succeed.

> Inside compose the app talks to the DB over the `postgres` service hostname,
> so `DB_HOST` is overridden to `postgres` regardless of what is in `.env`.

### Development (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

This swaps the `api` container to the `development` target and bind-mounts
`./src` so changes reload automatically. `node_modules` stays inside the
container (so the Alpine-compiled `bcrypt` binary is used, not the host's).

## Build the image directly

```bash
# Production image
docker build --target production -t sports-ecommerce-backend:latest .

# Run it (point DB_* at a reachable Postgres)
docker run --rm -p 8000:8000 --env-file .env sports-ecommerce-backend:latest
```

## CI (`.github/workflows/ci.yml`)

Runs on push / PR to `main` and `features`:

1. **build-and-test** — `npm ci` → `npm run build` → `npm test` (unit).
2. **e2e** — spins up a PostgreSQL service, runs migrations, then `npm run test:e2e`.
3. **docker-build** — verifies the production image builds (no push).

> Linting is **not** run in CI because the repo has no ESLint config yet. Add an
> `eslint.config.js` and a `lint` step once it is set up.

## CD (`.github/workflows/cd.yml`)

Runs on push to `main`, on `v*` tags, or manually (`workflow_dispatch`). It
builds the production image and pushes it to the GitHub Container Registry:

```
ghcr.io/<owner>/<repo>:latest        # default branch
ghcr.io/<owner>/<repo>:main
ghcr.io/<owner>/<repo>:1.2.3         # from a v1.2.3 tag
ghcr.io/<owner>/<repo>:sha-<commit>
```

No extra secrets are needed — the built-in `GITHUB_TOKEN` is granted
`packages: write`. To make the package public, change its visibility in the
repo's *Packages* settings after the first push.

## Notes

- The only native dependency is **bcrypt**; the dependency stages install
  `python3/make/g++` so it compiles on Alpine. The runtime image does not carry
  the toolchain.
- The container `HEALTHCHECK` polls `GET /api/v1/health`.
- The image runs as the non-root `node` user.
- Never commit `.env` — it is git-ignored and excluded from the build context.
