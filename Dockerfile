FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ && npm install

FROM deps AS build
COPY tsconfig*.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ && npm install --omit=dev && apk del python3 make g++
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 3000
CMD ["npm", "start"]
