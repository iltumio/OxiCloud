import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "../resources/gen/openapi.json",
  output: "src/lib/api",
  plugins: ["@tanstack/svelte-query"],
});
