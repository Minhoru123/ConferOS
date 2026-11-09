/**
 * OpenTelemetry bootstrap. It only starts when OTEL_EXPORTER_OTLP_ENDPOINT is set, so local dev and tests stay quiet.
 * Endpoint, headers (for example the Dash0 auth token) and protocol come from the standard OTEL_* environment variables.
 * The SDK is imported here, not at the top of the file, so a machine that doesn't export telemetry never has to load it.
 */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const [{ NodeSDK }, { getNodeAutoInstrumentations }] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/auto-instrumentations-node"),
  ]);
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "backchannel-api",
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  process.on("SIGTERM", () => {
    void sdk.shutdown();
  });
}

export {};
