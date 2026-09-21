# Multi-stage Dockerfile for Enterprise Real-Time Kanban Server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and client package definitions
COPY package*.json ./
COPY client/package*.json ./client/

# Install root & client dependencies
RUN npm install
RUN npm --prefix client install

# Copy application source code
COPY . .

# Build Vite React frontend
RUN npm run client:build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --only=production

# Copy built app and assets from builder stage
COPY --from=builder /app /app

EXPOSE 3001

CMD ["node", "server.js"]
