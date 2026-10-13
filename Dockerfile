# The tracker: API server + built web app in one image. See docs/deploy.md.
FROM node:22-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace manifests first, so dependency install is cached across code changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY packages/display/package.json packages/display/
COPY packages/kambi/package.json packages/kambi/
COPY packages/markets/package.json packages/markets/
COPY packages/matching/package.json packages/matching/
COPY packages/sports-data/package.json packages/sports-data/
RUN npm ci

COPY . .
# The npm scripts read ../../.env; in the container, settings come from the environment instead.
RUN npm run db:generate -w @sports-better/api && npm run build -w @sports-better/web && touch .env

ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
EXPOSE 4100

# Apply pending migrations, then start.
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && npm run start"]
