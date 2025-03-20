import { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

export const BEST_PRACTICES_PROMPT = {
  name: "best_practices",
  description: "Best practices for writing Tailpipe SQL queries",
} as const;

export async function handleBestPracticesPrompt(): Promise<GetPromptResult> {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `When writing SQL queries for Tailpipe, follow these best practices:

1. SQL Syntax and Style
   - Use DuckDB SQL syntax for all queries
   - Use 2 spaces for indentation in SQL queries
   - Use lowercase for SQL keywords (e.g., 'select', 'from', 'where')

2. Finding and Using Tables
   - Use the list_tables tool to discover available tables to query
   - Every table has a tp_timestamp column that can be used to limit the time range of queries
   - While using tp_timestamp is not required, it's helpful when querying logs to focus on relevant time periods

3. Data Freshness
   - Use the reconnect tool to get a new connection to Tailpipe with the latest data available
   - This is particularly useful when you need to ensure you're querying the most recent data

Example query following these practices:
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
