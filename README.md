# Sports E-Commerce — Backend (NestJS)

NestJS + PostgreSQL + TypeORM backend for the Sports E-Commerce platform, built
with a 4-layer **DDD** structure (one domain per SRS module). See
[`CLAUDE.md`](./CLAUDE.md) and the workspace skills for the full conventions.

- **Stack:** NestJS 10 · TypeORM 0.3 · PostgreSQL · JWT + SMS OTP · Swagger
- **Base URL:** `http://localhost:8000/api/v1`
- **Swagger docs:** `http://localhost:8000/api/v1/docs`
- **Health check:** `http://localhost:8000/api/v1/health`

---

## 1. Prerequisites

| Tool       | Version    |
| ---------- | ---------- |
| Node.js    | 22.x (LTS) |
| npm        | 10.x       |
| PostgreSQL | 16 / 17    |

> Prefer containers? Skip straight to [§7 Docker](#7-docker) — it brings up
> PostgreSQL, runs migrations, and starts the API with one command.

---

## 2. Project setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file and fill in the secrets
cp .env.example .env
```

Then edit `.env`. The minimum needed to boot against a local database:

```ini
PORT=8000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-password
DB_NAME=e-commerce

# Required so the app can sign tokens
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
```

Create the database once (if it does not exist):

```bash
createdb e-commerce          # or: psql -U postgres -c "CREATE DATABASE \"e-commerce\";"
```

See [`.env.example`](./.env.example) for the full, documented list of variables
(OTP, payments, notifications, reports, RBAC, etc.).

---

## 3. Run the app

```bash
npm run start:dev          # development with hot reload (watch mode)
npm run start              # plain start (no watch)
npm run build              # compile TypeScript -> dist/
npm run start:prod         # run the compiled build (node dist/main)
```

Once running:

- API: <http://localhost:8000/api/v1>
- Swagger: <http://localhost:8000/api/v1/docs>
- Health: <http://localhost:8000/api/v1/health>

---

## 4. Database migrations

Schema changes are **always** done through TypeORM migrations — `synchronize` is
never enabled. Migrations live in `src/database/migrations/` and use the
standalone data source in [`src/database/data-source.ts`](./src/database/data-source.ts).

> **Migration timestamp rule:** every migration filename / class epoch must be a
> real system-clock timestamp (see the `backend-implementation` skill §9).

```bash
# Apply all pending migrations (run this after pulling new code)
npm run migration:run

# Revert the most recently applied migration
npm run migration:revert

# Generate a migration from entity changes (diffs entities vs. the DB)
npm run migration:generate -- src/database/migrations/<Name>

# Create an empty migration to write by hand
npm run migration:create -- src/database/migrations/<Name>
```

---

## 5. Seed data

Seeds are idempotent (safe to re-run). Run them **in this order** for a complete
dataset — later seeds depend on earlier ones.

```bash
# 1. Migrations must be applied first
npm run migration:run

# 2. Core reference data
npm run seed:rbac                  # permissions, system roles, bootstrap Super Admin
npm run seed:catalog-attributes    # catalog attributes + options (sku, color, size, …)
npm run seed:catalog-families      # attribute families (depends on catalog-attributes)
npm run seed:geo-area              # geo areas / delivery zones
npm run seed:notifications         # SMS/email notification templates
npm run seed:cms-pages             # CMS pages (about, policies, …)

# 3. Demo / sample data — customers, products, inventory, orders, payments, refunds
#    (depends on: rbac + catalog-attributes + catalog-families)
npm run seed:demo

# 4. (optional) Fill inventory for any variants that still lack a record
npm run seed:inventory
```

### What `seed:demo` creates

A realistic dataset so an admin can explore the panel and reports end-to-end:

- **2 customers** with addresses — login password for all: `Customer123!`
- **4 products** (boots, jersey, turf shoes, football) → **10 variants** + inventory
- **6 orders** covering every payment + lifecycle scenario:

  | Order       | Method     | Status          | Payment                | Refund  |
  | ----------- | ---------- | --------------- | ---------------------- | ------- |
  | SO-DEMO-001 | COD        | delivered       | cod_collected          | —       |
  | SO-DEMO-002 | bKash      | delivered       | paid (coupon discount) | —       |
  | SO-DEMO-003 | SSLCommerz | refunded        | refunded               | full    |
  | SO-DEMO-004 | bKash      | pending_payment | unpaid                 | —       |
  | SO-DEMO-005 | COD        | shipped         | cod_pending            | —       |
  | SO-DEMO-006 | SSLCommerz | delivered       | partially_refunded     | partial |

The bootstrap **admin** login comes from `seed:rbac` (defaults in `.env`):
`superadmin@sportshop.com.bd` / `ChangeMe-Admin1` — change before any real use.

---

## 6. Testing

```bash
npm test                   # unit tests (Jest)
npm run test:e2e           # end-to-end tests (Supertest)
npm run lint               # ESLint (autofix)
```

---

## 7. Docker

A full containerised stack (PostgreSQL + migration runner + API) is provided.

```bash
cp .env.example .env
docker compose up --build              # API at http://localhost:8000/api/v1
```

For hot-reload development inside containers and the full CI/CD details, see
[`DOCKER.md`](./DOCKER.md).

---

## 8. Project structure

```
src/
├── main.ts            # bootstrap: global prefix /api/v1, Swagger, validation, filters
├── app.module.ts      # root module — all domain modules registered here
├── config/            # configuration
├── database/
│   ├── data-source.ts # standalone TypeORM data source (migration CLI)
│   ├── migrations/    # schema migrations (real-timestamp filenames)
│   └── seeds/         # idempotent seed scripts (see §5)
├── shared/            # guards, filters, interceptors, decorators, exceptions
└── domains/           # one folder per SRS module — DDD 4-layer:
    └── <module>/
        ├── domain/          # entities, value objects, repo interfaces (no Nest/TypeORM)
        ├── application/     # use cases / services
        ├── infrastructure/  # TypeORM entities, repositories, mappers
        └── presentation/    # controllers, DTOs
```

**Domains:** `auth` · `rbac` · `catalog` · `inventory` · `cart` · `search` ·
`content` · `promotions` · `orders` · `payments` · `wishlist` · `leads` ·
`reports` · `customers` · `dashboard` · `notifications`.

---

## 9. Conventions (quick reference)

- **Base path** `/api/v1`. **Response envelope:** `{ data }` / `{ data, meta }` /
  `{ error: { code, message, details } }`.
- **Money** `Decimal(12,2)`, currency `BDT`. **Phones** E.164 `+880…`. **UUID** PKs.
- TypeScript strict — no `any`, no `console.log` (use `Logger`), no hardcoded secrets.
- DDD layering: domain layer has zero Nest/TypeORM imports; controllers hold no
  business logic; ORM entities ≠ domain entities (mappers in between).

See [`CLAUDE.md`](./CLAUDE.md) for the complete process and golden rules.

develop by koushik

```

```
