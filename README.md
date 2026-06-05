# Sports E-Commerce — Backend (NestJS)

NestJS + PostgreSQL + TypeORM backend, built with a 4-layer DDD structure per
`.claude/skills/backend-implementation/SKILL.md`.

## Run

```bash
npm install
npm run start:dev
```

- API base URL: `http://localhost:8000/api/v1`
- Health check: `http://localhost:8000/api/v1/health`
- Swagger docs: `http://localhost:8000/api/v1/docs`

Port is configurable via `PORT` in `.env` (default `8000`).

## Structure

```
src/
├── main.ts            # bootstrap: global prefix /api, Swagger at /api/docs
├── app.module.ts      # root module (domain modules registered here)
├── config/            # configuration
├── database/          # data-source.ts, migrations/, seeds/
├── shared/            # guards, filters, interceptors, decorators, exceptions
└── domains/           # one folder per SRS module (auth, catalog, …) — added per task
```

> No feature code yet — this is the runnable server scaffold only. Domains are
> added one at a time following the project skills and SRS.
