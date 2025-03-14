import { DatabaseService } from "../services/database.js";

export const QUERY_TOOL = {
  name: "query",
  description: "Run a read-only SQL query",
  inputSchema: {
    type: "object",
    properties: {
      sql: { type: "string" },
    },
  },
} as const;

export async function handleQueryTool(db: DatabaseService, args: { sql: string }) {
  try {
    // Execute the query
    const rows = await db.executeQuery(args.sql);
    
    // Convert to JSON with pretty printing
    const resultText = JSON.stringify(rows, null, 2);

    return {
      content: [{ type: "text", text: resultText }],
      isError: false,
    };
  } catch (error) {
    let errorMessage = "Query execution failed";
    if (error instanceof Error) {
      errorMessage = `Query execution failed: ${error.message}`;
    }
    
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
    };
  }
} 