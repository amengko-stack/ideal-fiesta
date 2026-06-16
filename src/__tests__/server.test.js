import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import supertest from "supertest";

// mock fetch before importing the app so the module sees the stub
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { app } = await import("../../server.js");
const request = supertest(app);

const FAKE_KEY = "sk-test-key";

function mockUpstreamOk(body = { content: [{ text: "ok" }] }, status = 200) {
  mockFetch.mockResolvedValueOnce({
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
  vi.stubEnv("ANTHROPIC_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── POST /api/chat ───────────────────────────────────────────────────────────
describe("POST /api/chat", () => {
  it("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await request.post("/api/chat").send({ messages: [] });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("returns 400 when messages is missing", async () => {
    const res = await request.post("/api/chat").send({ system: "you are helpful" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/messages/);
  });

  it("returns 400 when messages is not an array", async () => {
    const res = await request.post("/api/chat").send({ messages: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/messages/);
  });

  it("proxies a successful Anthropic response", async () => {
    const upstreamBody = { content: [{ text: "Hello!" }] };
    mockUpstreamOk(upstreamBody, 200);

    const res = await request.post("/api/chat").send({
      messages: [{ role: "user", content: "Hi" }],
      system: "you are a coach",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(upstreamBody);
  });

  it("forwards non-200 upstream status codes", async () => {
    mockUpstreamOk({ error: { type: "authentication_error" } }, 401);

    const res = await request.post("/api/chat").send({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(res.status).toBe(401);
    expect(res.body.error.type).toBe("authentication_error");
  });

  it("returns 502 when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await request.post("/api/chat").send({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Failed to reach Anthropic/);
    expect(res.body.detail).toBe("ECONNREFUSED");
  });

  it("sends the correct headers to Anthropic", async () => {
    mockUpstreamOk();
    await request.post("/api/chat").send({ messages: [] });

    const [_url, options] = mockFetch.mock.calls[0];
    expect(options.headers["x-api-key"]).toBe(FAKE_KEY);
    expect(options.headers["anthropic-version"]).toBe("2023-06-01");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("uses default model when ANTHROPIC_MODEL is not set", async () => {
    mockUpstreamOk();
    await request.post("/api/chat").send({ messages: [] });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
  });

  it("passes system prompt to Anthropic, defaulting to empty string", async () => {
    mockUpstreamOk();
    await request.post("/api/chat").send({ messages: [] });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system).toBe("");
  });

  it("passes provided system prompt to Anthropic", async () => {
    mockUpstreamOk();
    await request.post("/api/chat").send({
      messages: [],
      system: "You are a strength coach.",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system).toBe("You are a strength coach.");
  });
});
