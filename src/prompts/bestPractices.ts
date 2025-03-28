import { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

export const BEST_PRACTICES_PROMPT = {
  name: "best_practices",
  description: "Best practices for working with Tailpipe data",
} as const;

export async function handleBestPracticesPrompt(): Promise<GetPromptResult> {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `When working with Tailpipe data, follow these best practices:

1. Exploring Available Data
   - Use the partition_list tool to see all available data partitions
   - Use the table_list tool to discover available tables
   - Use the table_show tool to get detailed information about a specific table's structure
   - These tools help you understand what data is available and how it's organized

2. SQL Syntax and Style
   - Use DuckDB SQL syntax for all queries
   - Use 2 spaces for indentation in SQL queries
   - Use lowercase for SQL keywords (e.g., 'select', 'from', 'where')
   - Use the query_tailpipe tool to execute your SQL queries

3. Data Freshness and Connections
   - Use the reconnect_tailpipe tool to get a new connection to Tailpipe with the latest data available
   - This is particularly useful when you need to ensure you're querying the most recent data
   - Every table has a tp_timestamp column that can be used to limit the time range of queries
   - While using tp_timestamp is not required, it's helpful when querying logs to focus on relevant time periods

Example workflow:
1. List available tables:
   \`table_list\`

2. Get details about a specific table:
   \`table_show aws_s3_bucket\`

3. Query the table:
\`\`\`sql
select
  bucket_name,
  region,
  tp_timestamp
from
  aws_s3_bucket
where
  tp_timestamp >= now() - interval '1 day'
order by
  tp_timestamp desc
\`\`\``,
        }
      }
    ]
  };
} 
