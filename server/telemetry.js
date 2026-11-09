// OpenTelemetry for Dash0. Load it before the server so instrumentation can patch express:
//   node --import ./server/telemetry.js server/index.js
// Nothing is exported unless OTEL_EXPORTER_OTLP_ENDPOINT is set. The endpoint, auth header and protocol come
// from the standard OTEL_* environment variables, for example OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ...".
import { metrics } from "@opentelemetry/api";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || "conferos",
    instrumentations: [getNodeAutoInstrumentations({ "@opentelemetry/instrumentation-fs": { enabled: false } })],
  });
  sdk.start();
  process.on("SIGTERM", () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}

// Product metrics. These are no-ops when telemetry is off. They listen to the transcript's own "line" event,
// so no other file needs to change.
const { events } = await import("./transcript.js");
const meter = metrics.getMeter("conferos");
const linesAdded = meter.createCounter("backchannel.lines", { description: "Transcript lines added, by source" });
const captionLag = meter.createHistogram("backchannel.caption.lag", {
  unit: "ms",
  description: "How late a microphone caption arrived after the words were spoken",
});

events.on("line", (line) => {
  linesAdded.add(1, { source: line.source || "replay" });
  if (Number.isFinite(line.lagMs)) captionLag.record(line.lagMs, { source: line.source || "replay" });
});
