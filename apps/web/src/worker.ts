import { lookupAddress } from "@/lookup";
import { handleMcp, handleMcpOptions } from "@/mcp";

interface WorkerEnvironment {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
}

export const handleLookup = async (request: Request): Promise<Response> => {
  const rawAddress = new URL(request.url).searchParams.get("address");
  const result = await lookupAddress(rawAddress);
  return Response.json(result.body, { status: result.status });
};

export default {
  async fetch(
    request: Request,
    environment: WorkerEnvironment
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/mcp") {
      if (request.method === "OPTIONS") {
        return handleMcpOptions(request);
      }
      return handleMcp(request);
    }
    if (url.pathname === "/api/health" && request.method === "HEAD") {
      return new Response(null, {
        headers: { "Cache-Control": "no-store" },
        status: 204,
      });
    }
    if (url.pathname === "/api/lookup" && request.method === "GET") {
      try {
        return await handleLookup(request);
      } catch {
        return Response.json(
          { error: "Council service unavailable" },
          { status: 502 }
        );
      }
    }
    return environment.ASSETS.fetch(request);
  },
};
