# AI Hub

A single mobile platform for chatting with all major AI models — Claude, DeepSeek, GPT, Qwen, and Gemini — from one place.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/ai-hub run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_OPENROUTER_BASE_URL`, `AI_INTEGRATIONS_OPENROUTER_API_KEY` — auto-provisioned via Replit AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo (React Native) with expo-router
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: OpenRouter via Replit AI Integrations (no user API key needed)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ai-hub/` — Expo mobile app
- `artifacts/ai-hub/constants/models.ts` — AI model definitions and quick-action categories
- `artifacts/ai-hub/constants/colors.ts` — dark theme design tokens
- `artifacts/api-server/src/routes/openrouter/` — chat API routes (CRUD + SSE streaming)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/conversations.ts` — conversations table (id, title, model, category, createdAt)
- `lib/db/src/schema/messages.ts` — messages table (id, conversationId, role, content, createdAt)

## Architecture decisions

- OpenRouter via Replit AI Integrations — supports all major AI providers (Claude, GPT, DeepSeek, Qwen, Gemini) without requiring user API keys
- SSE streaming for chat responses — real-time token-by-token delivery via `expo/fetch` with ReadableStream on the client
- Model selection stored per conversation — each chat remembers which model it was started with
- Backend handles model routing — mobile app sends messages to `/api/openrouter/conversations/:id/messages` and the server uses the conversation's stored model

## Product

- Home screen: select an AI model (tap avatar to switch), message input, quick-action categories (Image, Destiny, Storyteller, Homework, Spy, Love, Calorie, Coding)
- Chat screen: full streaming conversation with the selected model, attachment menu, model switcher in header
- History screen: all past conversations grouped by date, filterable by category, with delete support

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before using updated types
- After DB schema changes, run `pnpm --filter @workspace/db run push`
- Expo workflow uses `EXPO_PUBLIC_DOMAIN` to construct API base URLs — set automatically in the workflow
