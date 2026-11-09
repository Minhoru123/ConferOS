FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server server
COPY public public
USER node
EXPOSE 3000
# telemetry.js starts OpenTelemetry before express loads. It does nothing unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
CMD ["node", "--import", "./server/telemetry.js", "server/index.js"]
