# CLAUDE.md — Backend (`e-commerce-nestjs-backend`)

> Per-repo guide for the **NestJS backend** of the Sports E-Commerce project.
> The workspace root [CLAUDE.md](../../CLAUDE.md) governs the overall process; this file is the backend-specific entry point. Read both before coding.

---

## 1. What this repo is

NestJS + PostgreSQL + TypeORM backend, built as **DDD 4-layer domains**. One domain per SRS module (`auth`, `catalog`, `inventory`, …). Source of truth for behaviour is always the SRS + API contract, never assumptions.

---

## 2. Golden rules

1. **Read first, code second** — `docs/srs/00-overview.md` → module SRS → module API contract → the design/brief. (paths in the workspace repo: `../../docs/…`)
2. **SRS / API contract win** over any code sample or skill text when they disagree.
3. **DDD layering** — domain layer has zero TypeORM/Nest imports; controllers hold no business logic; use cases inject repository interfaces; ORM ≠ domain (mappers).
4. **No invented endpoints/fields** — every route + column traces to the contract / SRS data model.
5. **No hardcoded secrets** — `ConfigService` + `.env`.
6. **TypeScript strict, no `any`, no `console.log`** (use `Logger`).

---

## 3. Skills (use these — they carry the detail)

| Skill | When |
|---|---|
| [backend-implementation](../../.claude/skills/backend-implementation/SKILL.md) | writing/altering any backend code (structure, DTOs, Swagger, migration-timestamp rule) |
| [backend-testing](../../.claude/skills/backend-testing/SKILL.md) | Jest unit + Supertest e2e |
| [backend-code-review](../../.claude/skills/backend-code-review/SKILL.md) | pre-merge / self-review |
| [git-workflow](../../.claude/skills/git-workflow/SKILL.md) | commit / branch / PR / merge |

---

## 4. Task workflow & self-review

Tasks come from the board [briefs/BUILD-SEQUENCE.md](../../briefs/BUILD-SEQUENCE.md). For each task: **claim** (Owner + `In progress` in board + brief) → **build to the brief** with the skills above → **test** → **review** → **PR into `features`** → on merge set `Status → Done` in board + brief. Full phase detail: workspace [CLAUDE.md §4](../../CLAUDE.md).

**Phase-5 self-review (run before opening the PR):**

```
[ ] All brief acceptance criteria met; mapped to FR IDs
[ ] Endpoints match the API contract exactly (method, path, response envelope, errors)
[ ] DDD layering intact (backend-code-review skill)
[ ] tsc --noEmit clean; no `any`; no console.log; no hardcoded secrets
[ ] Migration(s) use a REAL system-clock timestamp, with a working down()
[ ] Every new endpoint + DTO documented in Swagger (visible at /api/v1/docs)
[ ] Unit + e2e tests pass (sibling test brief)
[ ] New env vars in .env.example
[ ] Committed, pushed, PR'd into `features` (git-workflow skill)
```

---

## 5. Run & commands

```bash
npm install
npm run start:dev          # dev (watch)
npm run build              # compile
npm run test               # unit
npm run test:e2e           # e2e
npm run migration:generate -- src/database/migrations/<Name>   # real-timestamp migration
npm run migration:run
```

- API base URL: `http://localhost:8000/api/v1`
- Health: `http://localhost:8000/api/v1/health`
- Swagger: `http://localhost:8000/api/v1/docs`
- Port via `PORT` in `.env` (default `8000`).

---

## 6. Conventions quick-reference

- **Base path** `/api/v1` (global prefix). **Response envelope:** `{ data }` / `{ data, meta }` / `{ error: { code, message, details } }` (SRS §7).
- **Layout:** `src/domains/<module>/{domain,application,infrastructure,presentation}`; shared in `src/shared/`; migrations/seeds in `src/database/`.
- **Money** `Decimal(12,2)`, currency `BDT`. **Phones** E.164 `+880…`. **UUID** PKs; `created_at`/`updated_at`; `deleted_at` where soft delete applies.
- **Migrations:** never `synchronize: true`; filename/class epoch = real system clock (see backend-implementation §9).
- **Auth:** JWT access/refresh + SMS OTP; admin routes guarded + `@Roles`.
