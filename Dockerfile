# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Sports E-Commerce — NestJS backend
#
# Multi-stage build. The only native dependency is `bcrypt`, which is compiled
# from source on Alpine (musl) — so the dependency stages install the toolchain
# (python3/make/g++). The final runtime stage stays lean and runs as a non-root
# user.
#
# Stages:
#   deps        full dependency tree (incl. dev) — used for build & migrations
#   build       compiles TypeScript -> dist/
#   prod-deps   production-only dependency tree
#   development hot-reload target (used by docker-compose.dev.yml)
#   production  lean runtime image (default target)
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------------------
# 1) deps — install ALL dependencies (incl. dev) for building + migrations
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# Build toolchain for native modules (bcrypt).
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2) build — compile TypeScript to dist/
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# 3) prod-deps — production-only dependency tree (no dev deps)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------------
# 4) development — hot-reload target for local development
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS development
ENV NODE_ENV=development
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 8000
CMD ["npm", "run", "start:dev"]

# ---------------------------------------------------------------------------
# 5) production — lean runtime image (default)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS production
ENV NODE_ENV=production
WORKDIR /app

# wget (busybox) is used by the container HEALTHCHECK below.
RUN apk add --no-cache wget

# Production node_modules + compiled output only.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

# Run as the unprivileged `node` user that ships with the base image.
USER node

EXPOSE 8000

# Hits the health endpoint defined in src/app.controller.ts (GET /api/v1/health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
