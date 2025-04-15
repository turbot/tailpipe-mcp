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

## Capabilities

### Tools

Database Operations:
- **tailpipe_query**
  - Run a read-only Tailpipe SQL query using DuckDB syntax
  - Input: `sql` (string): The SQL query to execute
  
- **tailpipe_connect**
  - Refresh the Tailpipe database connection to get the latest data, or connect to a different database path
  - Optional input: `database_path` (string): Database path to connect to. If not provided, refreshes the current connection.

Data Structure Operations:
- **tailpipe_partition_list**
  - List all available Tailpipe partitions with simple statistics
  - No input parameters required

- **tailpipe_partition_show**
  - Show details of a specific Tailpipe partition
  - Input: `name` (string): Name of the partition to show details for

- **tailpipe_table_list**
  - List all available Tailpipe tables
  - No input parameters required

- **tailpipe_table_show**
  - Show details of a specific Tailpipe table and its columns
  - Input: `name` (string): Name of the table to show details for

Plugin Operations:
- **tailpipe_plugin_list**
  - List all Tailpipe plugins installed on the system
  - No input parameters required

- **tailpipe_plugin_show**
  - Get details for a specific Tailpipe plugin installation
  - Input: `name` (string): Name of the plugin to show details for

Source Operations:
- **tailpipe_source_list**
  - List all Tailpipe sources available on the system
  - No input parameters required

- **tailpipe_source_show**
  - Get details for a specific Tailpipe source
  - Input: `name` (string): Name of the source to show details for

Status Operations:
- **tailpipe_status**
  - Get the current status of the Tailpipe MCP server
  - No input parameters required
  - Returns information about:
    - Connected database
    - Server configuration
    - Runtime environment

### Prompts

The Tailpipe MCP includes a built-in prompt to help you work effectively with the data:

- **best_practices**
  - Best practices for working with Tailpipe data
  - Provides guidance on:
    - Using tools to explore available data (tailpipe_table_list, tailpipe_table_show, etc.)
    - SQL syntax and style conventions
    - Data freshness and connection management
    - Example workflow and queries

You can load this prompt in Claude Desktop through the plug icon in the prompt window. The prompt will teach Claude how to:
- Use the appropriate tools to explore and understand your data
- Write efficient SQL queries using DuckDB syntax
- Follow consistent formatting and style conventions
- Work with data timestamps and freshness

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher (includes `npx`)
- [Tailpipe](https://tailpipe.io/downloads) installed and configured

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
        "@turbot/tailpipe-mcp"
      ]
    }
  }
}
```

By default, this will use the Tailpipe CLI to discover your database. Make sure Tailpipe is installed and configured first.

To connect to a specific database file instead, add the path to the args:

```json
{
  "mcpServers": {
    "tailpipe": {
      "command": "npx",
      "args": [
        "-y",
        "@turbot/tailpipe-mcp",
        "/path/to/your/tailpipe.db"
      ]
    }
  }
}
```

Save the configuration file and restart Claude Desktop for the changes to take effect.

### Cursor

Open your Cursor MCP configuration file at `~/.cursor/mcp.json` and add the following configuration to the "mcpServers" section:

```json
{
  "mcpServers": {
    "tailpipe": {
      "command": "npx",
      "args": [
        "-y",
        "@turbot/tailpipe-mcp"
      ]
    }
  }
}
```

By default, this will use the Tailpipe CLI to discover your database. Make sure Tailpipe is installed and configured first.

To connect to a specific database file instead, add the path to the args:

```json
{
  "mcpServers": {
    "tailpipe": {
      "command": "npx",
      "args": [
        "-y",
        "@turbot/tailpipe-mcp",
        "/path/to/your/tailpipe.db"
      ]
    }
  }
}
```

Save the configuration file and restart Cursor for the changes to take effect.

## Prompting Guide

First, run the `best_practices` prompt included in the MCP server to teach your LLM how best to work with Tailpipe. Then, ask anything!

Explore the Tailpipe configuration:
```
What tables do we have available in Tailpipe?
```

Simple, specific questions work well:
```
Show me all S3 bucket creation events from CloudTrail in the last 24 hours
```

Generate a report:
```
What were my top 10 AWS services by cost last month?
```

Dive into the details:
```
Find any IAM users created outside working hours (9am-5pm) in the last week
```

Get information about specific situations:
```
Give me a timeline of the session where Venu created the IAM access key
```

Explore with wide ranging questions:
```
Analyze our cloudtrail errors for any specific security risks
```

Remember to:
- Be specific about the time period you're interested in
- Mention the type of data you want to analyze (CloudTrail events, cost data, etc.)
- Start with simple queries before adding complex conditions
- Use natural language - the LLM will handle the SQL translation
- Be bold and open, it's amazing what the LLM with discover and achieve!

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

5. To run the server:

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

You can control the server behavior using environment variables:

- `TAILPIPE_MCP_DATABASE_PATH`: Specify the database path (alternative to command line argument)
- `TAILPIPE_MCP_LOG_LEVEL`: Control logging verbosity with these values:
  - `DEBUG`: Show all messages (most verbose)
  - `INFO`: Show informational, warning, and error messages (default)
  - `WARN`: Show only warning and error messages
  - `ERROR`: Show only error messages
  - `SILENT`: Disable all logging
- `TAILPIPE_MCP_DEBUG`: Set to 'true' to enable additional debug logging for Tailpipe CLI interactions

Example using environment variables:
```sh
TAILPIPE_MCP_DATABASE_PATH=/path/to/db.db TAILPIPE_MCP_LOG_LEVEL=DEBUG node dist/index.js
```

6. To use your local development version with Claude Desktop, update your `claude_desktop_config.json`:
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

7. For local development with Cursor, update your `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "tailpipe": {
      "name": "Tailpipe",
      "description": "Query Tailpipe data",
      "command": "~/src/tailpipe-mcp/dist/index.js"
    }
  }
}
```

8. The MCP Inspector is helpful for testing and debugging. To test your local development version:

```sh
npx @modelcontextprotocol/inspector dist/index.js

# Or with explicit database path:
npx @modelcontextprotocol/inspector dist/index.js /path/to/your/tailpipe.db
```

## Open Source & Contributing

This repository is published under the [Apache 2.0 license](https://www.apache.org/licenses/LICENSE-2.0). Please see our [code of conduct](https://github.com/turbot/.github/blob/main/CODE_OF_CONDUCT.md). We look forward to collaborating with you!

[Tailpipe](https://tailpipe.io) is a product produced from this open source software, exclusively by [Turbot HQ, Inc](https://turbot.com). It is distributed under our commercial terms. Others are allowed to make their own distribution of the software, but they cannot use any of the Turbot trademarks, cloud services, etc. You can learn more in our [Open Source FAQ](https://turbot.com/open-source).

## Get Involved

**[Join #tailpipe on Slack →](https://turbot.com/community/join)**

Want to help but don't know where to start? Pick up one of the `help wanted` issues:
* [Tailpipe](https://github.com/turbot/tailpipe/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)
* [Tailpipe MCP](https://github.com/turbot/tailpipe-mcp/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)