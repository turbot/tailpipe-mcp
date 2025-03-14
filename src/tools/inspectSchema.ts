import { DatabaseService } from "../services/database.js";

export const INSPECT_SCHEMA_TOOL = {
  name: "inspect_schema",
  description: "List all tables in a schema",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The schema name to inspect",
      },
      filter: {
        type: "string",
        description: "Optional SQL ILIKE pattern to filter table names (e.g., '%aws_iam_%')",
      },
    },
    required: ["name"],
  },
} as const;

export async function handleInspectSchemaTool(db: DatabaseService, args: { name: string; filter?: string }) {
  try {
    // Get all tables in the schema
    const sql = `SELECT 
                   table_name, 
                   '' as description -- duckdb doesn't support table comments
                 FROM 
                   information_schema.tables
                 WHERE 
                   table_schema = ?
                 ORDER BY 
                   table_name`;
                   
    const allTables = await db.executeQuery(sql, [args.name]);
    
    // If filter is specified, filter the results in memory
    let results = allTables;
    if (args.filter) {
      // Convert SQL LIKE pattern to JS regex
      const filterPattern = args.filter
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
        
      console.error(`Filtering tables with regex: ${filterPattern}`);
      
      // Use regex to filter tables
      const regex = new RegExp(filterPattern, 'i');
      results = allTables.filter(table => regex.test(table.table_name));
      
      console.error(`Found ${results.length} tables matching filter pattern`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error inspecting schema: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}