# Tailpipe Model Context Protocol (MCP) Server

Enable AI assistants like Claude to explore and query your Tailpipe data! This Model Context Protocol (MCP) server lets AI tools:

- Browse your Tailpipe schemas and tables
- Run SQL queries against your data
- Get schema information and metadata

Perfect for:
- Having AI assist with Tailpipe query development
- Enabling natural language interactions with your Tailpipe data
- Exploring and analyzing your data with AI assistance

Connects directly to your local Tailpipe database file, giving you AI access to all your cloud and SaaS data.

## Features

### Tools

The server provides tools for:
- Browsing schemas and tables
- Inspecting table structures
- Running SQL queries
- Best practices for working with Tailpipe data

### Resource Templates

The Tailpipe MCP includes resource templates that define how to interact with different types of resources. Currently supported resource types:

#### Schema
- Represents a Tailpipe schema
- Contains tables and their metadata

#### Table
- Represents a Tailpipe table
- Contains column definitions and metadata

Resource templates enable structured access to Tailpipe metadata, making it easier for AI tools to understand and navigate your data.

## Usage

### Cursor

To use with Cursor:

1. Add this to your `~/.cursor/config.json`:

```json
{
  "mcps": {
    "tailpipe": {
      "name": "Tailpipe",
      "description": "Query Tailpipe data",
      "server": "github:turbot/tailpipe-mcp",
      "args": ["path/to/your/database.db"]
    }
  }
}
```

You can use any Tailpipe database file path above. The database file must exist before starting the server.

### Best Practices

The Tailpipe MCP includes a pre-built `best_practices` prompt. Running it before running your own prompts will teach the LLM how to work most effectively with Tailpipe, including:

- How to explore schemas and tables
- How to write efficient queries
- How to write queries that follow Tailpipe conventions
- Best practices for performance

### Example Prompts

Each prompt below is designed to work with Tailpipe's table structure, where each resource type (buckets, instances, etc.) has its own table.

```
# List all tables in the aws schema
list tables in aws schema

# Show me the structure of the aws_s3_bucket table
what columns are in aws_s3_bucket?

# Find unencrypted buckets
find s3 buckets that don't have encryption enabled

# Complex analysis
what EC2 instances have public IPs and are in a public subnet?
```

The AI will:
- Choose the appropriate Tailpipe tables for your request
- Write and execute efficient SQL queries
- Format the results in an easy to read way
- Explain any important aspects of the results

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

1. Clone the repository:
```bash
git clone https://github.com/turbot/tailpipe-mcp.git
cd tailpipe-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Run tests:
```bash
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

5. To run the server locally:
```bash
node dist/index.js path/to/your/database.db

# Or use npm script
npm run start -- path/to/your/database.db
```

### Cursor Configuration

For local development with Cursor, update your `~/.cursor/config.json`:

```json
{
  "mcps": {
    "tailpipe": {
      "name": "Tailpipe",
      "description": "Query Tailpipe data",
      "server": "~/src/tailpipe-mcp/dist/index.js",
      "args": ["path/to/your/database.db"]
    }
  }
}
```

Note: Replace the server path with the actual path to your local build. For example, if you cloned the repository to `~/src/tailpipe-mcp`, you would use `~/src/tailpipe-mcp/dist/index.js`.

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.