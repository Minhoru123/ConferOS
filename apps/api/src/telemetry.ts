import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

/**
 * OpenTelemetry bootstrap. It only starts when OTEL_EXPORTER_OTLP_ENDPOINT is set, so local dev and tests stay quiet.
 * Endpoint, headers (for example the Dash0 auth token) and protocol come from the standard OTEL_* environment variables.
 */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "backchannel-api",
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  process.on("SIGTERM", () => {
    void sdk.shutdown();
  });
}
