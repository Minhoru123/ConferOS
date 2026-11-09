// Imported first, so that every other module sees the variables from the repo's .env file.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // No .env file, as in containers: the environment is used as it is.
}
