import type { IncomingMessage, ServerResponse } from "node:http";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

import { handleLookup } from "./src/worker";

const serveLookup = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  try {
    const lookupRequest = new Request(
      new URL(request.url ?? "/", "http://localhost"),
      { method: request.method ?? "GET" }
    );
    const lookupResponse = await handleLookup(lookupRequest);
    response.statusCode = lookupResponse.status;
    for (const [key, value] of lookupResponse.headers.entries()) {
      response.setHeader(key, value);
    }
    response.end(await lookupResponse.text());
  } catch {
    response.statusCode = 502;
    response.end(JSON.stringify({ error: "Council service unavailable" }));
  }
};

const lookupDevPlugin: Plugin = {
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split("?")[0] !== "/api/lookup") {
        next();
        return;
      }
      void serveLookup(request, response);
    });
  },
  name: "hcc-bin-day-dev-api",
};

export default defineConfig({
  plugins: [react(), tailwindcss(), lookupDevPlugin],
});
