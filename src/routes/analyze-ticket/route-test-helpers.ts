import { afterAll, beforeAll, beforeEach } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../../../index.ts";
import type {
  AnalyzeTicketBody,
  AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AnalyzeTicketTestClient {
  getBaseUrl: () => string;
  postTicket: (
    payload: AnalyzeTicketBody | Record<string, unknown> | string,
    headers?: Record<string, string>,
  ) => Promise<Response>;
  request: (
    method: string,
    path: string,
    options?: { body?: string; headers?: Record<string, string> },
  ) => Promise<Response>;
}

const originalLlmGuardrail = process.env.ENABLE_LLM_GUARDRAIL;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

/**
 * Registers beforeAll/afterAll/beforeEach hooks and returns HTTP helpers.
 * Call once at the top of a describe block.
 */
export function setupAnalyzeTicketTestServer(): AnalyzeTicketTestClient {
  let server: Server;
  let baseUrl: string;

  beforeEach(() => {
    process.env.ENABLE_LLM_GUARDRAIL = "false";
    delete process.env.OPENROUTER_API_KEY;
  });

  beforeAll(() => {
    const app = createApp();
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
    if (originalLlmGuardrail === undefined) {
      delete process.env.ENABLE_LLM_GUARDRAIL;
    } else {
      process.env.ENABLE_LLM_GUARDRAIL = originalLlmGuardrail;
    }
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  });

  async function request(
    method: string,
    path: string,
    options: { body?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: options.headers ?? {},
      body: options.body,
    });
  }

  async function postTicket(
    payload: AnalyzeTicketBody | Record<string, unknown> | string,
    headers: Record<string, string> = { "content-type": "application/json" },
  ): Promise<Response> {
    const body =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    return request("POST", "/analyze-ticket", { body, headers });
  }

  return {
    getBaseUrl: () => baseUrl,
    postTicket,
    request,
  };
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function readAnalyzeTicketResponse(
  response: Response,
): Promise<AnalyzeTicketResponse> {
  return readJson<AnalyzeTicketResponse>(response);
}

export async function readApiError(response: Response): Promise<ApiErrorBody> {
  return readJson<ApiErrorBody>(response);
}

/** Required top-level keys on a successful analyze-ticket response. */
export const REQUIRED_RESPONSE_KEYS = [
  "ticket_id",
  "relevant_transaction_id",
  "evidence_verdict",
  "case_type",
  "severity",
  "department",
  "agent_summary",
  "recommended_next_action",
  "customer_reply",
  "human_review_required",
] as const satisfies readonly (keyof AnalyzeTicketResponse)[];
