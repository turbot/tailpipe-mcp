import { DatabaseService } from "../services/database.js";
import { logger } from "../services/logger.js";

export const INSPECT_TABLE_TOOL = {
  name: "inspect_table",
  description: "Get detailed information about a table including its columns",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The name of the table to inspect",
      },
      schema: {
        type: "string",
        description: "Optional schema name to specify which table to inspect",
      },
    },
    required: ["name"],
  },
} as const;

export async function handleInspectTableTool(db: DatabaseService, args: { name: string; schema?: string }) {
  try {
    // Try a more direct approach by creating custom SQL without bind params
    // to work around DuckDB parameter binding issues
    let columnRows;
    
    if (args.schema) {
      logger.debug(`Getting columns for table ${args.name} in schema ${args.schema}`);
      
      // Build a query without parameter binding
      const sql = `SELECT 
                     column_name,
                     data_type,
                     '' as description -- duckdb doesn't support column comments
                   FROM 
                     information_schema.columns
                   WHERE 
                     table_schema = '${args.schema.replace(/'/g, "''")}'
                     AND table_name = '${args.name.replace(/'/g, "''")}'
                   ORDER BY 
                     ordinal_position`;
                     
      columnRows = await db.executeQuery(sql);
    } else {
      // If no schema specified, first find the table in any schema
      logger.debug(`Finding schema for table ${args.name}`);
      
      // Find schemas that contain the table
      const findSchemaSql = `SELECT 
                               table_schema 
                             FROM 
                               information_schema.tables
                             WHERE 
                               table_name = '${args.name.replace(/'/g, "''")}'
                               AND table_schema NOT IN ('information_schema', 'pg_catalog')
                             ORDER BY
                               CASE 
                                 WHEN table_schema = 'main' THEN 1
                                 ELSE 2
                               END,
                               table_schema
                             LIMIT 1`;
      
      const schemaRows = await db.executeQuery(findSchemaSql);
      
      if (schemaRows.length === 0) {
        return {
          content: [{ type: "text", text: `Table '${args.name}' not found in any schema` }],
          isError: true,
        };
      }
      
      // Use the first matching schema
      const schema = schemaRows[0].table_schema;
      logger.debug(`Found table ${args.name} in schema ${schema}`);
      
      // Get the columns for the table
      const columnSql = `SELECT 
                            column_name,
                            data_type,
                            '' as description -- duckdb doesn't support column comments
                          FROM 
                            information_schema.columns
                          WHERE 
                            table_schema = '${schema.replace(/'/g, "''")}'
                            AND table_name = '${args.name.replace(/'/g, "''")}'
                          ORDER BY 
                            ordinal_position`;
                            
      columnRows = await db.executeQuery(columnSql);
    }
    
    return {
      content: [{ type: "text", text: JSON.stringify(columnRows, null, 2) }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error inspecting table: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}