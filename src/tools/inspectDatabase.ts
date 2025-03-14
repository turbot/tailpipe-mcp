import { DatabaseService } from "../services/database.js";

export const INSPECT_DATABASE_TOOL = {
  name: "inspect_database",
  description: "List all schemas in the database",
  inputSchema: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        description: "Optional filter to apply to schema names",
      },
    },
  },
} as const;

export async function handleInspectDatabaseTool(db: DatabaseService, args: { filter?: string }) {
  const filterClause = args.filter ? `AND schema_name LIKE '%${args.filter}%'` : '';

  const result = await db.executeQuery(
    `SELECT DISTINCT schema_name
     FROM information_schema.schemata
     WHERE schema_name NOT IN ('information_schema')
     ${filterClause}
     ORDER BY schema_name`
  );

  const schemas = result.map(row => row.schema_name);

  return {
    content: [{ type: "text", text: JSON.stringify(schemas, null, 2) }],
    isError: false,
  };
} 