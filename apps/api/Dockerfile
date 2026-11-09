# Build from the repo root: docker build -f apps/api/Dockerfile -t backchannel-api:dev .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w apps/api
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 8787
CMD ["node", "apps/api/dist/index.js"]
