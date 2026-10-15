/** Order Mira's chat replies try providers in. Edit freely. */
export const CHAT_PROVIDERS = [
  { provider: "gemini", model: "gemini-2.5-flash", keyEnv: "GEMINI_API_KEY" },
  { provider: "groq", model: "llama-3.3-70b-versatile", keyEnv: "GROQ_API_KEY" },
  { provider: "groq", model: "llama-3.1-8b-instant", keyEnv: "GROQ_API_KEY" },
  { provider: "lovable", model: "openai/gpt-6-astra", keyEnv: "LOVABLE_API_KEY" },
] as const;

export const CHAT_HISTORY_LIMIT = 12;
export const MEMORY_FACTS_LIMIT = 10;
/** Run memory extraction once every N messages. */
export const FACTS_EVERY_N_MESSAGES = 8;

export const ALL_FAILED_MESSAGE = "Mira ko thodi der ka break chahiye";
