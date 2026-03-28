/**
 * self-hosted-modules.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the self-hosted replacements of Manus Forge dependencies:
 *   1. LLM (llm.ts)       — OpenAI-compatible endpoint
 *   2. Storage (storage.ts) — AWS S3-compatible with local fallback
 *   3. Notifications (notification.ts) — Resend email delivery
 *   4. Stubs (map.ts, imageGeneration.ts, voiceTranscription.ts) — throw/return errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── 1. LLM ──────────────────────────────────────────────────────────────────

describe("LLM helper (llm.ts)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("throws when OPENAI_API_KEY is not set", async () => {
    delete process.env.OPENAI_API_KEY;
    const { invokeLLM } = await import("./_core/llm.js");
    await expect(
      invokeLLM({ messages: [{ role: "user", content: "hello" }] })
    ).rejects.toThrow("OPENAI_API_KEY is not configured");
  });

  it("sends a POST to the configured base URL with the API key", async () => {
    process.env.OPENAI_API_KEY = "test-key-123";
    process.env.OPENAI_BASE_URL = "https://api.example.com/v1";
    process.env.OPENAI_MODEL = "gpt-test";

    const mockResponse = {
      id: "chatcmpl-test",
      created: 1700000000,
      model: "gpt-test",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello!" },
          finish_reason: "stop",
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const { invokeLLM } = await import("./_core/llm.js");
    const result = await invokeLLM({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.example.com/v1/chat/completions");
    expect((init?.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer test-key-123"
    );
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("gpt-test");
    expect(result.choices[0].message.content).toBe("Hello!");
  });

  it("defaults to https://api.openai.com/v1 when OPENAI_BASE_URL is absent", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.OPENAI_BASE_URL;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "x",
        created: 0,
        model: "gpt-4o-mini",
        choices: [
          { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
        ],
      }),
    } as Response);

    const { invokeLLM } = await import("./_core/llm.js");
    await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("throws when the API returns a non-OK status", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid API key",
    } as Response);

    const { invokeLLM } = await import("./_core/llm.js");
    await expect(
      invokeLLM({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow("LLM invoke failed: 401");
  });

  it("passes response_format through to the payload", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "x",
        created: 0,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: '{"name":"Alice"}' },
            finish_reason: "stop",
          },
        ],
      }),
    } as Response);

    const { invokeLLM } = await import("./_core/llm.js");
    await invokeLLM({
      messages: [{ role: "user", content: "extract name" }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "person",
          strict: true,
          schema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
            additionalProperties: false,
          },
        },
      },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("person");
  });
});

// ─── 2. Storage ───────────────────────────────────────────────────────────────

describe("Storage helper (storage.ts)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("storagePut falls back to local /tmp when S3_BUCKET is not set", async () => {
    delete process.env.S3_BUCKET;
    const { storagePut } = await import("./storage.js");
    const result = await storagePut("test/hello.txt", "hello world", "text/plain");
    expect(result.key).toBe("test/hello.txt");
    expect(result.url).toMatch(/^file:\/\//);
  });

  it("storageGet falls back to local /tmp when S3_BUCKET is not set", async () => {
    delete process.env.S3_BUCKET;
    const { storageGet } = await import("./storage.js");
    const result = await storageGet("test/hello.txt");
    expect(result.key).toBe("test/hello.txt");
    expect(result.url).toMatch(/^file:\/\//);
  });

  it("storagePut sends a PutObjectCommand to S3 when S3_BUCKET is set", async () => {
    process.env.S3_BUCKET = "my-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "AKIATEST";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";

    // Mock the S3Client.send method
    const mockSend = vi.fn().mockResolvedValue({});
    vi.doMock("@aws-sdk/client-s3", async () => {
      const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>(
        "@aws-sdk/client-s3"
      );
      return {
        ...actual,
        S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
      };
    });

    const { storagePut } = await import("./storage.js");
    const result = await storagePut("uploads/image.png", Buffer.from("data"), "image/png");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(result.key).toBe("uploads/image.png");
    // Should build standard AWS URL when no custom endpoint/publicBaseUrl
    expect(result.url).toBe(
      "https://my-bucket.s3.us-east-1.amazonaws.com/uploads/image.png"
    );
  });

  it("storagePut uses S3_PUBLIC_BASE_URL when set", async () => {
    process.env.S3_BUCKET = "my-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "AKIATEST";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.com";

    const mockSend = vi.fn().mockResolvedValue({});
    vi.doMock("@aws-sdk/client-s3", async () => {
      const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>(
        "@aws-sdk/client-s3"
      );
      return {
        ...actual,
        S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
      };
    });

    const { storagePut } = await import("./storage.js");
    const result = await storagePut("uploads/file.csv", "csv,data", "text/csv");

    expect(result.url).toBe("https://cdn.example.com/uploads/file.csv");
  });
});

// ─── 3. Notifications ─────────────────────────────────────────────────────────

describe("Notification helper (notification.ts)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns true and logs to console in dev mode (no RESEND_API_KEY)", async () => {
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM = "noreply@example.com";

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { notifyOwner } = await import("./_core/notification.js");
    const result = await notifyOwner({
      title: "Test Alert",
      content: "Server recovered after 3 retries.",
    });

    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();

    if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey;
    else delete process.env.RESEND_API_KEY;
  });

  it("throws TRPCError when title is empty", async () => {
    const { notifyOwner } = await import("./_core/notification.js");
    await expect(
      notifyOwner({ title: "  ", content: "Some content" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws TRPCError when content is empty", async () => {
    const { notifyOwner } = await import("./_core/notification.js");
    await expect(
      notifyOwner({ title: "Alert", content: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns false when email delivery fails", async () => {
    const originalKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "noreply@example.com";

    // Mock sendEmail to throw
    vi.doMock("../auth/emailHelper.js", () => ({
      sendEmail: vi.fn().mockRejectedValue(new Error("SMTP error")),
    }));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { notifyOwner } = await import("./_core/notification.js");
    const result = await notifyOwner({
      title: "Alert",
      content: "Something happened.",
    });

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Notification]"),
      expect.any(Error)
    );

    if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey;
    else delete process.env.RESEND_API_KEY;
  });
});

// ─── 4. Stubs ─────────────────────────────────────────────────────────────────

describe("Stub modules (map, imageGeneration, voiceTranscription)", () => {
  it("makeRequest (map.ts) throws a descriptive error", async () => {
    const { makeRequest } = await import("./_core/map.js");
    await expect(makeRequest("/maps/api/geocode/json", {})).rejects.toThrow(
      "Maps integration is not configured"
    );
  });

  it("generateImage (imageGeneration.ts) throws a descriptive error", async () => {
    const { generateImage } = await import("./_core/imageGeneration.js");
    await expect(generateImage({ prompt: "test" })).rejects.toThrow(
      "Image generation is not configured"
    );
  });

  it("transcribeAudio (voiceTranscription.ts) returns a SERVICE_ERROR object", async () => {
    const { transcribeAudio } = await import("./_core/voiceTranscription.js");
    const result = await transcribeAudio({ audioUrl: "https://example.com/audio.mp3" });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.code).toBe("SERVICE_ERROR");
    }
  });
});

// ─── 5. ENV ───────────────────────────────────────────────────────────────────

describe("ENV registry (env.ts)", () => {
  it("exports expected keys", async () => {
    const { ENV } = await import("./_core/env.js");
    expect(ENV).toHaveProperty("cookieSecret");
    expect(ENV).toHaveProperty("databaseUrl");
    expect(ENV).toHaveProperty("isProduction");
    expect(ENV).toHaveProperty("appUrl");
    // Backward-compat deprecated fields still present
    expect(ENV).toHaveProperty("forgeApiKey");
    expect(ENV).toHaveProperty("forgeApiUrl");
  });

  it("does not expose OAuth-era fields (appId, oAuthServerUrl, ownerOpenId)", async () => {
    const { ENV } = await import("./_core/env.js");
    expect(ENV).not.toHaveProperty("appId");
    expect(ENV).not.toHaveProperty("oAuthServerUrl");
    expect(ENV).not.toHaveProperty("ownerOpenId");
  });
});
