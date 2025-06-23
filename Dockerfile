FROM node:lts-alpine AS builder
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies (cached layer)
RUN npm ci --silent

# Copy config and source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build

# Production stage
FROM node:lts-alpine
WORKDIR /app

# Copy built app and dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S ailint -u 1001
RUN chown -R ailint:nodejs /app
USER ailint

EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/ping', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js", "--transport", "http", "--port", "8080"]