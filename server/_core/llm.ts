/**
 * LLM helper — self-hosted OpenAI-compatible backend.
 *
 * Required env vars:
 *   OPENAI_API_KEY   — your OpenAI API key (or provider token)
 *
 * Optional env vars:
 *   OPENAI_BASE_URL  — base URL for OpenAI-compatible providers
 *                      (Ollama, Azure, Together, Groq, etc.)
 *                      Defaults to https://api.openai.com/v1
 *   OPENAI_MODEL     — model name to use (default: gpt-4o-mini)
 *
 * The function signature and return type are identical to the previous
 * Manus Forge implementation so all call sites in routers/ai.ts remain
 * unchanged.
 */

// ─── Types (unchanged public API) ────────────────────────────────────────────

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: { name: string };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") return { type: "text", text: part };
  if (part.type === "text") return part;
  if (part.type === "image_url") return part;
  if (part.type === "file_url") return part;
  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
      .join("\n");
    return { role, name, tool_call_id, content };
  }

  const parts = ensureArray(message.content).map(normalizeContentPart);
  if (parts.length === 1 && parts[0].type === "text") {
    return { role, name, content: (parts[0] as TextContent).text };
  }
  return { role, name, content: parts };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;
  if (toolChoice === "required") {
    if (!tools?.length)
      throw new Error("tool_choice 'required' requires at least one tool");
    if (tools.length > 1)
      throw new Error(
        "tool_choice 'required' needs a single tool or an explicit tool name"
      );
    return { type: "function", function: { name: tools[0].function.name } };
  }
  if ("name" in toolChoice)
    return { type: "function", function: { name: toolChoice.name } };
  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicit = responseFormat ?? response_format;
  if (explicit) {
    if (
      explicit.type === "json_schema" &&
      !("json_schema" in explicit && explicit.json_schema?.schema)
    ) {
      throw new Error("responseFormat json_schema requires a schema object");
    }
    return explicit;
  }

  const schema = outputSchema ?? output_schema;
  if (!schema) return undefined;
  if (!schema.name || !schema.schema)
    throw new Error("outputSchema requires both name and schema");

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ─── Config ───────────────────────────────────────────────────────────────────

function getLLMConfig() {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const baseUrl = (
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Invoke an OpenAI-compatible chat-completions endpoint.
 *
 * When OPENAI_API_KEY is absent the function throws a clear error so
 * operators know exactly which env var to set.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const { apiKey, baseUrl, model } = getLLMConfig();

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. " +
        "Set it in your environment to enable AI enrichment features."
    );
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    maxTokens,
    max_tokens,
  } = params;

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
  };

  if (tools?.length) payload.tools = tools;

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice ?? tool_choice,
    tools
  );
  if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;

  const resolvedMaxTokens = maxTokens ?? max_tokens;
  if (resolvedMaxTokens) payload.max_tokens = resolvedMaxTokens;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });
  if (normalizedResponseFormat)
    payload.response_format = normalizedResponseFormat;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}
