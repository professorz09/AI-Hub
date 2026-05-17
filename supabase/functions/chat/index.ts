// Supabase Edge Function: streams an OpenRouter chat completion and
// persists the assistant message when the stream completes.
//
// Request body:
//   { conversationId: number, content: string,
//     systemPrompt?: string, model?: string }
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

interface ReqBody {
  conversationId: number;
  content: string;
  systemPrompt?: string;
  model?: string;
}

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { conversationId, content, systemPrompt, model } = body;
  if (!conversationId || !content?.trim()) {
    return new Response(
      JSON.stringify({ error: "conversationId and content are required" }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !openrouterKey) {
    return new Response(
      JSON.stringify({ error: "Server is missing environment variables" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
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
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { error: insertUserErr } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content });
  if (insertUserErr) {
    return new Response(
      JSON.stringify({ error: "Failed to save user message" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const { data: history, error: histErr } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (histErr || !history) {
    return new Response(
      JSON.stringify({ error: "Failed to load history" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const m of history) {
    messages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    });
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
        model: model?.trim() || conv.model,
        messages,
        max_tokens: 8192,
        stream: true,
      }),
    },
  );

  if (!openrouterResp.ok || !openrouterResp.body) {
    const errText = await openrouterResp.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `OpenRouter error: ${errText.slice(0, 200)}` }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      const reader = openrouterResp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
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

        if (full) {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: full,
          });
        }
        controller.enqueue(sse({ done: true }));
      } catch (err) {
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
