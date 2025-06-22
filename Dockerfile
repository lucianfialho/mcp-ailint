FROM node:lts-alpine AS builder
WORKDIR /app

# Copy package and configuration files
COPY package.json package-lock.json* tsconfig.json ./

# Copy source code
COPY src ./src

# Install dependencies and build
RUN npm install && npm run build

# ----- Production Stage -----
FROM node:lts-alpine
WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# Copy package.json for production install
COPY package.json ./

# Install only production dependencies
RUN npm install --production --ignore-scripts

# Expose HTTP port
EXPOSE 8080

# Default command using CLI flags
CMD ["node", "dist/index.js", "--transport", "http", "--port", "8080"]