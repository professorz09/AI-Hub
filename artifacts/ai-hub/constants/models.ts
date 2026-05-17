export interface AIModel {
  id: string;
  name: string;
  version: string;
  description: string;
  color: string;
  textColor: string;
  badge: "hot" | "think" | "think+hot" | null;
  section: "recent" | "more";
}

export const AI_MODELS: AIModel[] = [
  {
    id: "anthropic/claude-opus-4.7-fast",
    name: "Claude",
    version: "4.7",
    description: "Thoughtful and intelligent conversation partner.",
    color: "#E8704A",
    textColor: "#FFFFFF",
    badge: null,
    section: "recent",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek",
    version: "V4-Flash",
    description: "Very creative, great for writing stories.",
    color: "#4B6CB7",
    textColor: "#FFFFFF",
    badge: "hot",
    section: "recent",
  },
  {
    id: "~openai/gpt-mini-latest",
    name: "GPT",
    version: "5-mini",
    description: "Smart, balanced, and great for study.",
    color: "#1A1A2E",
    textColor: "#FFFFFF",
    badge: null,
    section: "recent",
  },
  {
    id: "qwen/qwen3.5-plus-20260420",
    name: "Qwen",
    version: "3.6 Plus",
    description: "Technical expert built for writing code.",
    color: "#2D5BE3",
    textColor: "#FFFFFF",
    badge: "think",
    section: "more",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    name: "Gemini",
    version: "2.5 Lite",
    description: "Good at understanding images and creativity.",
    color: "#1565C0",
    textColor: "#FFFFFF",
    badge: null,
    section: "more",
  },
  {
    id: "~google/gemini-pro-latest",
    name: "Gemini",
    version: "3.1 Pro",
    description: "Extremely capable, great for complex tasks.",
    color: "#0D47A1",
    textColor: "#FFFFFF",
    badge: "think+hot",
    section: "more",
  },
];

export const DEFAULT_MODEL = AI_MODELS[0]!;

export function getModelById(id: string): AIModel {
  return AI_MODELS.find((m) => m.id === id) ?? DEFAULT_MODEL;
}

export interface QuickAction {
  id: string;
  name: string;
  icon: string;
  color: string;
  systemPrompt: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "image",
    name: "Image",
    icon: "image-outline",
    color: "#4B6CB7",
    systemPrompt:
      "You are an image generation assistant. Help users create detailed, vivid image prompts for AI image generators. Provide descriptive, artistic guidance.",
  },
  {
    id: "destiny",
    name: "Destiny",
    icon: "sparkles-outline",
    color: "#9B59B6",
    systemPrompt:
      "You are a mystical destiny reader. Give thoughtful, poetic readings about life paths and future possibilities in an engaging, mysterious style.",
  },
  {
    id: "storyteller",
    name: "Storyteller",
    icon: "book-outline",
    color: "#8B7EC8",
    systemPrompt:
      "You are a creative storyteller. Craft compelling narratives with rich characters and vivid worlds based on user prompts.",
  },
  {
    id: "homework",
    name: "Homework",
    icon: "school-outline",
    color: "#2196F3",
    systemPrompt:
      "You are a helpful tutor. Explain concepts clearly, help solve problems step by step, and encourage learning.",
  },
  {
    id: "spy",
    name: "Spy",
    icon: "eye-outline",
    color: "#607D8B",
    systemPrompt:
      "You are a secret agent assistant. Respond in a spy thriller style, helping with strategy, puzzles, and covert planning.",
  },
  {
    id: "love",
    name: "Love",
    icon: "heart-outline",
    color: "#E91E63",
    systemPrompt:
      "You are a compassionate relationship advisor. Give warm, thoughtful guidance on love, relationships, and emotional wellbeing.",
  },
  {
    id: "calorie",
    name: "Calorie",
    icon: "flame-outline",
    color: "#FF5722",
    systemPrompt:
      "You are a nutrition and fitness expert. Help users track calories, plan healthy meals, and maintain a balanced diet.",
  },
  {
    id: "coding",
    name: "Coding",
    icon: "code-slash-outline",
    color: "#4CAF50",
    systemPrompt:
      "You are an expert programmer. Help users write clean code, debug issues, explain concepts, and solve technical problems.",
  },
];
