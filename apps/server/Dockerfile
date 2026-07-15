FROM oven/bun:1 as base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN bun install

# Copy source code
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

# Build
WORKDIR /app/apps/server
RUN bun run build

# Production
FROM oven/bun:1-slim

WORKDIR /app

COPY --from=base /app/apps/server/dist ./dist
COPY --from=base /app/apps/server/package.json ./

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
