FROM node:20.12.2-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY src/ ./src/

FROM base AS production
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
