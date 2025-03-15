# Tailpipe Model Context Protocol (MCP) Server

Enable AI assistants like Claude to explore and query your Tailpipe data! This Model Context Protocol (MCP) server lets AI tools:

- Browse your Tailpipe schemas and tables
- Understand your data structure and relationships
- Run SQL queries against your data
- Provide insights and analysis based on your cloud and SaaS data

Perfect for:
- Getting AI help analyzing your cloud infrastructure
- Having AI assist with Tailpipe query development
- Enabling natural language interactions with your Tailpipe data
- Exploring and analyzing your data with AI assistance

Connects directly to your local Tailpipe database file, giving you AI access to all your cloud and SaaS data.

## Components

### Prompts

- **best_practices**
  - Best practices for working with Tailpipe data
  - Provides detailed guidance on:
    - How to explore available data
    - When to use specific tables
    - Query structure and optimization
    - Response formatting
    - Performance considerations

### Tools

- **query**
  - Execute SQL queries against the connected Tailpipe database
  - Input: `sql` (string): The SQL query to execute
  
- **list_tables**
  - List available tables in the database
  - Optional input: `schema` (string): Filter tables by schema name
  - Optional input: `filter` (string): Filter tables by name pattern
  
- **inspectDatabase**
  - List all schemas in the database
  - No input required, returns all schemas
  
- **inspectSchema**
  - List all tables in a schema
  - Input: `name` (string): The schema name to inspect
  
- **inspectTable**
  - Get detailed information about a table including its columns
  - Input: `name` (string): The name of the table to inspect
  - Optional input: `schema` (string): The schema containing the table
  
- **clearCache**
  - Clear any cached database information
  - No input parameters required

### Resource Templates

The Tailpipe MCP includes resource templates that define how to interact with different types of resources. Currently supported resource types:

- **schema**
  - Represents a Tailpipe schema
  - Properties include name and tables
  
- **table**
  - Represents a Tailpipe table
  - Properties include name, columns, and metadata

Resource templates enable structured access to Tailpipe metadata, making it easier for AI tools to understand and navigate your data.

## Installation

### Claude Desktop

[How to use MCP servers with Claude Desktop →](https://modelcontextprotocol.io/quickstart/user)

Add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tailpipe": {
      "command": "npx",
      "args": [
        "-y",
        "github:turbot/tailpipe-mcp"
      ]
    }
  }
}
```

This will automatically use the Tailpipe CLI to discover your database. If you want to specify a database file path explicitly, you can add it as an additional argument:

```json
{
  "mcpServers": {
    "tailpipe": {
      "command": "npx",
      "args": [
        "-y",
        "github:turbot/tailpipe-mcp",
        "/path/to/your/tailpipe.db"
      ]
    }
  }
}
```

### Cursor

To use with Cursor, add this to your `~/.cursor/config.json`:

```json
{
  "mcps": {
    "tailpipe": {
      "name": "Tailpipe",
      "description": "Query Tailpipe data",
      "server": "github:turbot/tailpipe-mcp"
    }
  }
}
```

If you prefer to specify the database path explicitly instead of using the Tailpipe CLI:

```json
{
  "mcps": {
    "tailpipe": {
      "name": "Tailpipe",
      "description": "Query Tailpipe data",
      "server": "github:turbot/tailpipe-mcp",
      "args": ["/path/to/your/tailpipe.db"]
    }
  }
}
```

## Prompting Guide

### Best Practices

The Tailpipe MCP includes a pre-built `best_practices` prompt. Running it before running your own prompts will teach the LLM how to work most effectively with Tailpipe, including:

- How to explore available data schemas and tables
- When to use specific tables for different resource types
- How to write efficient queries that follow Tailpipe conventions
- Best practices for formatting and presenting results

In Claude Desktop, you can load this prompt through the plug icon in the prompt window.

### Example Prompts

Each prompt below is designed to work with Tailpipe's table structure, where each resource type (buckets, instances, etc.) has its own table.

```
List all tables in the aws schema
```

```
What columns are in the aws_s3_bucket table?
```

```
Find S3 buckets that don't have encryption enabled
```

```
What EC2 instances have public IPs and are in a public subnet?
```

Remember to:
- Ask about specific resource types (e.g., EC2 instances, S3 buckets, IAM users)
- Be clear about which services or schemas you're interested in
- Start with simple questions about one resource type
- Add more complexity or conditions after seeing the initial results

Claude will:
- Choose the appropriate Tailpipe tables for your request
- Write efficient SQL queries behind the scenes
- Format the results in a clear, readable way
- Provide insights and analysis based on your data

## Local Development

To set up the project for local development:

1. Clone the repository and navigate to the directory:
```sh
git clone https://github.com/turbot/tailpipe-mcp.git
cd tailpipe-mcp
```

2. Install dependencies:
```sh
npm install
```

3. Build the project:
```sh
npm run build
```

4. For development with auto-recompilation:
```sh
npm run watch
```

5. To test locally:
```sh
# Run the main test (conversation with query testing)
npm test

# Test just the DuckDB connection
npm run test:duckdb

# Run a basic server test
npm run test:simple

# Set up for manual testing
npm run test:setup

# Clean up any leftover test files
npm run clean:tests
```

6. To run the server:

The MCP server can be run in two ways:

```sh
# Automatic database discovery (using Tailpipe CLI)
node dist/index.js

# Or with explicit database path
node dist/index.js /path/to/your/tailpipe.db

# Control log verbosity with environment variable
LOG_LEVEL=DEBUG node dist/index.js
```

When run without arguments, the server will use the Tailpipe CLI to detect your database (`tailpipe connect --output json`). This requires the Tailpipe CLI to be installed and configured.

You can control the logging verbosity using the `LOG_LEVEL` environment variable. Valid values are:
- `DEBUG`: Show all messages (most verbose)
- `INFO`: Show informational, warning, and error messages (default)
- `WARN`: Show only warning and error messages
- `ERROR`: Show only error messages
- `SILENT`: Disable all logging

7. To use your local development version with Claude Desktop, update your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tailpipe": {
      "command": "node",
      "args": [
        "/path/to/your/workspace/dist/index.js",
        "/path/to/your/tailpipe.db"
      ]
    }
  }
}
```

Replace `/path/to/your/workspace` with the absolute path to your local development directory. For example, if you cloned the repository to `~/src/tailpipe-mcp`, you would use `~/src/tailpipe-mcp/dist/index.js`.

8. For local development with Cursor, update your `~/.cursor/config.json`:
```json
{
  "mcps": {
    "tailpipe": {
      "name": "Tailpipe",
      "description": "Query Tailpipe data",
      "server": "~/src/tailpipe-mcp/dist/index.js",
      "args": ["/path/to/your/tailpipe.db"]
    }
  }
}
```

## Testing with MCP Inspector

The MCP Inspector is helpful for testing and debugging. To test your local development version:

```sh
npx @modelcontextprotocol/inspector dist/index.js

# Or with explicit database path:
npx @modelcontextprotocol/inspector dist/index.js /path/to/your/tailpipe.db
```

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.