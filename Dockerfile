# ==============================
# Stage 1: Install dependencies
# ==============================
FROM node:22-alpine AS deps

WORKDIR /app

# Install libc6-compat — required by some native npm modules on Alpine
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts && npm cache clean --force

# ==============================
# Stage 2: Build
# ==============================
FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars MUST be available at build time because Next.js
# inlines them into the client JS bundle during `next build`.
# Pass them as --build-arg in docker-compose or docker build.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_ES_CONFIG_ID
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_LOCALE=en

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_META_ES_CONFIG_ID=$NEXT_PUBLIC_META_ES_CONFIG_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_LOCALE=$NEXT_PUBLIC_APP_LOCALE

# Suppress Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ==============================
# Stage 3: Production (standalone)
# ==============================
FROM node:22-alpine AS production

# Install libc6-compat for Alpine compatibility with native modules
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nextjs -u 1001 -G nodejs

# Copy the standalone server + static assets + public files
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public            ./public

# Copy i18n messages (next-intl needs them at runtime)
COPY --from=build --chown=nextjs:nodejs /app/messages          ./messages

USER nextjs

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Standalone output produces a self-contained server.js
CMD ["node", "server.js"]
