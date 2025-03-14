import { DatabaseService } from "../services/database.js";

export const LIST_TABLES_TOOL = {
  name: "list_tables",
  description: "List available tables in the database",
  inputSchema: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        description: "Optional pattern to filter table names (e.g. '%ec2%')",
      },
      schema: {
        type: "string",
        description: "Optional schema name to filter tables by schema",
      },
    },
  },
} as const;

export async function handleListTablesTool(db: DatabaseService, args: { schema?: string; filter?: string }) {
  try {
    let query = `
      SELECT 
        table_schema as schema,
        table_name as name
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema')
    `;

    // Add filter conditions based on args
    const params = [];
    
    // Add schema filter if provided
    if (args.schema) {
      query += ` AND table_schema = ?`;
      params.push(args.schema);
    }
    
    // Add name filter if provided
    if (args.filter) {
      query += ` AND table_name LIKE ?`;
      params.push(args.filter);
    }
    
    // Add ordering
    query += ` ORDER BY table_schema, table_name`;
    
    const rows = await db.executeQuery(query, params);
    
    // Return formatted result
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      isError: false
    };
  } catch (error) {
    // Handle any errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [{ type: "text", text: `Error listing tables: ${errorMessage}` }],
      isError: true
    };
  }

} 