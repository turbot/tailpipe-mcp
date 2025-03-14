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
          text: `When writing SQL queries for Tailpipe, follow these essential best practices:

1. Response Style
   - Always return a markdown table with the results of the query
   - Minimize explanation of the query
   - Only explain specific aspects of the query if they are non-obvious or particularly important
   - Don't explain your understanding of the request or how you crafted the query
   - Keep responses concise and focused on the data
   - Explain your thinking when reworking queries for an error

2. Query Structure
   - Use CTEs (WITH Clauses) for complex queries
   - For simple queries, use direct select statements
   - Example of a well-structured query:
      \`\`\`sql
      with active_users as (
        select user_id, user_name, arn, tags
        from aws_iam_user
      ),
      user_policies as (
        select user_name, policy_name
        from aws_iam_user_policy
      )
      select 
        u.user_name,
        u.arn,
        p.policy_name
      from active_users u
      join user_policies p using (user_name)
      where
        u.tags['Environment'] = 'Production'
        and p.policy_name LIKE 'Admin%'
      order by u.user_name
      \`\`\`

3. SQL syntax
   - Indent with 2 spaces
   - Use lowercase for keywords
   - Example:
     select 
       user_name,
       arn,
       create_date,
       tags['Environment'] as environment
     from aws_iam_user
     order by create_date desc

4. Column Selection
   - Always specify exact columns needed, avoid select *
   - Each column adds processing overhead
   - Bad:  select * from {table_name}
   - Good: select user_name, user_id from {table_name}

5. Understanding the schema
   - Never guess table or column names - always query the information schema
   - Use list_tables to discover and filter tables. This is the most efficient way to discover tables.
   - Use inspect_database to get a list of schemas
   - Use inspect_schema to get a list of tables in a schema
   - Use inspect_table to get a list of columns in a table
   - If those are insufficient, query the information_schema directly
   - Never limit results when querying information_schema
   
   To list available tables in a schema:
   select 
     table_schema,
     table_name
   from information_schema.tables
   where 
     table_schema NOT IN ('information_schema')
   order by table_schema, table_name;

   To get details about a specific table's columns:
   select 
     column_name,
     data_type
   from information_schema.columns
   where 
     table_schema = '{schema_name}'
     AND table_name = '{table_name}'
   order by ordinal_position;

6. Schema Qualification in Queries
   - Always use schema-qualified table names for clarity
   - Example: select * from my_schema.my_table

7. Query Structure
   - Start with the most filtered table in CTEs
   - Use where clauses early to reduce data processing
   - Consider using LIMIT when exploring data (except for information_schema queries)

8. Performance Considerations
   - DuckDB is column-oriented, so selecting fewer columns improves performance
   - Use appropriate data types in comparisons
   - Take advantage of DuckDB's parallel processing capabilities for large datasets`
        }
      }
    ]
  };
} 