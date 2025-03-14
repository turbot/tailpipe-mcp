import { DatabaseService } from "../services/database.js";

export const CLEAR_CACHE_TOOL = {
  name: "clear_cache",
  description: "Clear any cached data (no-op in Tailpipe)",
  inputSchema: {
    type: "object",
    properties: {},
  },
} as const;

export async function handleClearCacheTool(db: DatabaseService) {
  // No-op in Tailpipe as DuckDB doesn't have the same caching mechanism
  return {
    content: [{ type: "text", text: "Cache clearing is not needed in Tailpipe." }],
    isError: false,
  };
} 