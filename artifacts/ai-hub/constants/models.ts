export interface AIModel {
  id: string;
  name: string;
  version: string;
  description: string;
  color: string;
  textColor: string;
  logoUrl: string;
  badge: "hot" | "think" | "think+hot" | null;
  section: "recent" | "more";
}

export const AI_MODELS: AIModel[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude",
    version: "3.5 Sonnet",
    description: "Thoughtful and intelligent conversation partner.",
    color: "#E8704A",
    textColor: "#FFFFFF",
    logoUrl: "https://www.google.com/s2/favicons?domain=claude.ai&sz=128",
    badge: null,
    section: "recent",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek",
    version: "V3",
    description: "Very creative, great for writing stories.",
    color: "#4B6CB7",
    textColor: "#FFFFFF",
    logoUrl: "https://www.google.com/s2/favicons?domain=deepseek.com&sz=128",
    badge: "hot",
    section: "recent",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT",
    version: "4o-mini",
    description: "Smart, balanced, and great for study.",
    color: "#1A1A2E",
    textColor: "#FFFFFF",
    logoUrl: "https://www.google.com/s2/favicons?domain=openai.com&sz=128",
    badge: null,
    section: "recent",
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen",
    version: "2.5 72B",
    description: "Technical expert built for writing code.",
    color: "#2D5BE3",
    textColor: "#FFFFFF",
    logoUrl: "https://www.google.com/s2/favicons?domain=qwenlm.ai&sz=128",
    badge: "think",
    section: "more",
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini",
    version: "2.0 Flash",
    description: "Good at understanding images and creativity.",
    color: "#1565C0",
    textColor: "#FFFFFF",
    logoUrl: "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128",
    badge: null,
    section: "more",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama",
    version: "3.3 70B",
    description: "Open-source powerhouse for complex tasks.",
    color: "#0D47A1",
    textColor: "#FFFFFF",
    logoUrl: "https://www.google.com/s2/favicons?domain=llama.meta.com&sz=128",
    badge: "think+hot",
    section: "more",
  },
];

export const DEFAULT_MODEL = AI_MODELS[0]!;

export function getModelById(id: string): AIModel {
  return AI_MODELS.find((m) => m.id === id) ?? DEFAULT_MODEL;
}

export interface QuickAction {
  id: "chat" | "youtube";
  name: string;
  icon: string;
  color: string;
  systemPrompt: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "chat",
    name: "Chat",
    icon: "chatbubbles",
    color: "#6C63FF",
    systemPrompt: "",
  },
  {
    id: "youtube",
    name: "YouTube Summary",
    icon: "logo-youtube",
    color: "#FF0000",
    systemPrompt:
      "You are a YouTube video summarization assistant. The user will provide a YouTube video URL. Produce a clear, structured summary including: (1) the video's main topic, (2) 5-8 key points as bullets, (3) notable timestamps or chapters if inferable from context, and (4) a concise takeaway. If you cannot directly fetch the video transcript, base the summary on the title, channel, and any context the user provides, and clearly note your assumptions.",
  },
];
