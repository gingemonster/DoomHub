FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ && npm ci

FROM deps AS build
COPY tsconfig*.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
  && apk del .build-deps \
  && npm cache clean --force \
  && rm -f package.json package-lock.json
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
