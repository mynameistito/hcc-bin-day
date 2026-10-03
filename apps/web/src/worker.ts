import {
  handleReminderPublicKey,
  handleReminderSubscribe,
  handleReminderUnsubscribe,
  isSameOriginRequest,
  sendDueReminders,
} from "@/lib/reminder-server";
import type { ReminderEnvironment } from "@/lib/reminder-server";
import { lookupAddress } from "@/lookup";
import { handleMcp, handleMcpOptions } from "@/mcp";

interface WorkerEnvironment extends ReminderEnvironment {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
  readonly REMINDER_LIMIT?: {
    readonly limit: (options: { readonly key: string }) => Promise<{
      readonly success: boolean;
    }>;
  };
}

const checkReminderRateLimit = async (
  request: Request,
  environment: WorkerEnvironment
): Promise<Response | null> => {
  if (!environment.REMINDER_LIMIT) {
    return null;
  }
  try {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const result = await environment.REMINDER_LIMIT.limit({ key: ip });
    return result.success
      ? null
      : Response.json(
          { error: "Too many reminder requests. Try again shortly." },
          { status: 429, headers: { "Retry-After": "60" } }
        );
  } catch {
    return Response.json(
      { error: "Reminder requests are temporarily unavailable" },
      { status: 503 }
    );
  }
};

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
    if (
      url.pathname === "/api/reminders/public-key" &&
      request.method === "GET"
    ) {
      return handleReminderPublicKey(environment);
    }
    if (url.pathname === "/api/reminders/subscription") {
      if (!isSameOriginRequest(request)) {
        return Response.json(
          { error: "Cross-origin reminder requests are not allowed" },
          { status: 403 }
        );
      }
      const rateLimitResponse = await checkReminderRateLimit(
        request,
        environment
      );
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      if (request.method === "POST") {
        return handleReminderSubscribe(request, environment);
      }
      if (request.method === "DELETE") {
        return handleReminderUnsubscribe(request, environment);
      }
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST, DELETE" },
      });
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
  scheduled: (
    controller: { readonly scheduledTime: number },
    environment: WorkerEnvironment,
    context: { readonly waitUntil: (promise: Promise<unknown>) => void }
  ): void => {
    context.waitUntil(
      sendDueReminders(environment, new Date(controller.scheduledTime))
    );
  },
};
