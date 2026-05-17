// Supabase Edge Function: streams an OpenRouter chat completion and
// persists the assistant message when the stream completes.
//
// Request body:
//   { conversationId: number, content: string,
//     systemPrompt?: string, model?: string,
//     skipUserInsert?: boolean, historyForModel?: string | null }
//
// Response: text/event-stream
//   data: {"content":"..."}\n\n   (deltas)
//   data: {"done":true}\n\n
//   data: {"error":"..."}\n\n     (on failure)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Server-side allowlist of acceptable OpenRouter model IDs. Mirrors
// AI_MODELS in artifacts/ai-hub/constants/models.ts. Pinning this list
// here stops a client from billing the project against arbitrary
// expensive models (Opus / GPT-5 / etc.) by hand-crafting the request.
// Keep this in sync with AI_MODELS when new models are added there.
const ALLOWED_MODELS = new Set<string>([
  "z-ai/glm-4.5-air:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "anthropic/claude-3.5-sonnet",
  "deepseek/deepseek-chat",
  "openai/gpt-4o-mini",
  "qwen/qwen-2.5-72b-instruct",
  "google/gemini-2.0-flash-exp:free",
]);

// How many of the most recent messages to feed back to the model as
// context. 10 ≈ last 5 user/assistant turns — keeps recent intent
// fresh while holding token cost roughly constant as a chat ages.
// Tune via the env var CHAT_HISTORY_LIMIT if a deployment needs a
// different ceiling.
const HISTORY_LIMIT_DEFAULT = 10;
const HISTORY_LIMIT = Math.max(
  2,
  Math.min(100, Number(Deno.env.get("CHAT_HISTORY_LIMIT")) || HISTORY_LIMIT_DEFAULT),
);

interface ReqBody {
  conversationId: number;
  content: string;
  systemPrompt?: string;
  model?: string;
  // When true, the user message is assumed to be already persisted by the
  // client (used by compare mode where one user turn fans out to N models).
  skipUserInsert?: boolean;
  // Only fetch and feed history for this model's column when in compare mode.
  // null/undefined → include all user + assistant messages.
  historyForModel?: string | null;
}

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return jsonErr(400, "Invalid JSON");
  }

  const {
    conversationId,
    content,
    systemPrompt,
    model,
    skipUserInsert,
    historyForModel,
  } = body;
  if (!conversationId || !content?.trim()) {
    return jsonErr(400, "conversationId and content are required");
  }

  // Reject runaway prompts before they reach the LLM. 32 KB of input
  // is already 8-10k tokens which is a generous upper bound for a
  // single user turn — anything bigger is almost certainly junk
  // (e.g. someone pasting an entire log file).
  if (content.length > 32_000) {
    return jsonErr(400, "Message too long (max 32k characters)");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !openrouterKey) {
    return jsonErr(500, "Server is missing environment variables");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, model")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv) {
    return jsonErr(404, "Conversation not found");
  }

  // Reject any model id not in the server allowlist. The conversation
  // table's stored model is allowed even if the allowlist later shrinks
  // (so existing chats keep working) — but a client-supplied override
  // must be in the current list.
  const requestedModel = (model?.trim() || conv.model) as string;
  if (!ALLOWED_MODELS.has(requestedModel) && requestedModel !== conv.model) {
    return jsonErr(400, "Unsupported model");
  }

  if (!skipUserInsert) {
    const { error: insertUserErr } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "user", content });
    if (insertUserErr) {
      return jsonErr(500, "Failed to save user message");
    }
  }

  // Pull only the most recent N messages so context (and token cost)
  // doesn't grow unbounded as a chat ages. We fetch in descending order
  // for the LIMIT to apply at the tail, then reverse to chronological
  // for the LLM call.
  const { data: recent, error: histErr } = await supabase
    .from("messages")
    .select("role, content, model")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (histErr || !recent) {
    return jsonErr(500, "Failed to load history");
  }
  const history = recent.slice().reverse();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const m of history) {
    // Defensive role clamp: drop anything that isn't a real chat turn.
    // Without this, a poisoned row (e.g. role="system" smuggled past the
    // CHECK constraint by direct SQL) would replay as a trusted turn.
    const rawRole = m.role;
    const role: "user" | "assistant" =
      rawRole === "user" ? "user"
      : rawRole === "assistant" ? "assistant"
      : "user"; // unknown role degrades to a user turn, never to system
    if (rawRole !== "user" && rawRole !== "assistant") continue;
    // Compare-mode filter: a model only sees its own prior assistant
    // turns. User turns are always included.
    if (
      role === "assistant" &&
      historyForModel != null &&
      m.model !== historyForModel
    ) {
      continue;
    }
    messages.push({ role, content: m.content });
  }

  const openrouterResp = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-hub.app",
        "X-Title": "AI Hub",
      },
      body: JSON.stringify({
        model: requestedModel,
        messages,
        max_tokens: 8192,
        stream: true,
      }),
    },
  );

  if (!openrouterResp.ok || !openrouterResp.body) {
    const errText = await openrouterResp.text().catch(() => "");
    return jsonErr(502, `OpenRouter error: ${errText.slice(0, 200)}`);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      const reader = openrouterResp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // Whatever has streamed gets flushed to the DB regardless of how
      // the stream ends (clean end, network drop, OpenRouter error,
      // client disconnect). Earlier the insert sat inside the try block,
      // so a drop mid-stream left the UI showing text the DB never saw —
      // and the next reload made the message vanish.
      const flush = async () => {
        if (!full) return;
        try {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: full,
            model: requestedModel,
          });
        } catch (_) {
          // Swallow — we've already streamed to the client; failing to
          // persist is a degraded state but not a fatal one.
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                full += delta;
                controller.enqueue(sse({ content: delta }));
              }
            } catch {
              // ignore malformed chunks (OpenRouter occasionally sends comments)
            }
          }
        }

        await flush();
        controller.enqueue(sse({ done: true }));
      } catch (err) {
        await flush();
        controller.enqueue(
          sse({ error: err instanceof Error ? err.message : "Stream failed" }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
