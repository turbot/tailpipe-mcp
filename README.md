[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/turbot-tailpipe-mcp-badge.png)](https://mseep.ai/app/turbot-tailpipe-mcp)

# Tailpipe Model Context Protocol (MCP) Server

Unlock the power of AI-driven log analysis with [Tailpipe](https://tailpipe.io)! This Model Context Protocol server seamlessly connects AI assistants like Claude to your cloud and SaaS logs, enabling natural language exploration and analysis of your entire data estate.

Tailpipe MCP bridges AI assistants and your log data, allowing natural language:
- Queries across CloudTrail, Kubernetes, and other cloud service logs
- Security incident investigation and analysis
- Cost and performance insights
- Query development assistance

Works with your local [Tailpipe](https://tailpipe.io/downloads) database files, providing safe, read-only access to all your cloud and SaaS log data.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher (includes `npx`)
- [Tailpipe](https://tailpipe.io/downloads) installed and configured

### Configuration

Add Tailpipe MCP to your AI assistant's configuration file:

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

### AI Assistant Setup

| Assistant | Config File Location | Setup Guide |
|-----------|---------------------|-------------|
| Claude Desktop | `claude_desktop_config.json` | [Claude Desktop MCP Guide →](https://modelcontextprotocol.io/quickstart/user) |
| Cursor | `~/.cursor/mcp.json` | [Cursor MCP Guide →](https://docs.cursor.com/context/model-context-protocol) |

Save the configuration file and restart your AI assistant for the changes to take effect.

## Prompting Guide

Ask anything about your log data!

Explore your log data:
```
What tables do we have available in Tailpipe?
```

Simple, specific questions work well:
```
Show me all S3 bucket creation events from CloudTrail in the last 24 hours
```

Generate security reports:
```
What were my top 10 AWS services by cost last month?
```

Dive into incident analysis:
```
Find any IAM users created outside working hours (9am-5pm) in the last week
```

Get timeline insights:
```
Give me a timeline of the session where Venu created the IAM access key
```

Explore potential risks:
```
Analyze our cloudtrail errors for any specific security risks
```

Remember to:
- Be specific about the time period you're interested in
- Mention the type of data you want to analyze (CloudTrail events, cost data, etc.)
- Start with simple queries before adding complex conditions
- Use natural language - the LLM will handle the SQL translation
- Be bold and exploratory, it's amazing what the LLM will discover and achieve!

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

### Resources

- **status**
  - Represents the current state of the Tailpipe connection
  - Properties include:
    - Connected database path
    - Server configuration
    - Runtime environment

This resource enables AI tools to check and verify the connection status to your Tailpipe database.

## Development

### Clone and Setup

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

### Testing

To test your local development build with AI tools that support MCP, update your MCP configuration to use the local `dist/index.js` instead of the npm package. For example:

```json
{
  "mcpServers": {
    "tailpipe": {
      "command": "node",
      "args": [
        "/absolute/path/to/tailpipe-mcp/dist/index.js",
        "/path/to/your/tailpipe.db"
      ]
    }
  }
}
```

Or, use the MCP Inspector to validate the server implementation:
```sh
npx @modelcontextprotocol/inspector dist/index.js
```

### Environment Variables

The following environment variables can be used to configure the MCP server:

- `TAILPIPE_MCP_DATABASE_PATH`: Specify the database path (alternative to command line argument)
- `TAILPIPE_MCP_LOG_LEVEL`: Control logging verbosity (default: `info`)
  - `debug`: Show all messages (most verbose)
  - `info`: Show informational, warning, and error messages
  - `warn`: Show only warning and error messages
  - `error`: Show only error messages
- `TAILPIPE_MCP_MEMORY_MAX_MB`: Maximum memory buffer size in megabytes for command execution

## Open Source & Contributing

This repository is published under the [Apache 2.0 license](https://www.apache.org/licenses/LICENSE-2.0). Please see our [code of conduct](https://github.com/turbot/.github/blob/main/CODE_OF_CONDUCT.md). We look forward to collaborating with you!

[Tailpipe](https://tailpipe.io) is a product produced from this open source software, exclusively by [Turbot HQ, Inc](https://turbot.com). It is distributed under our commercial terms. Others are allowed to make their own distribution of the software, but they cannot use any of the Turbot trademarks, cloud services, etc. You can learn more in our [Open Source FAQ](https://turbot.com/open-source).

## Get Involved

**[Join #tailpipe on Slack →](https://turbot.com/community/join)**

Want to help but don't know where to start? Pick up one of the `help wanted` issues:
* [Tailpipe](https://github.com/turbot/tailpipe/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)
* [Tailpipe MCP](https://github.com/turbot/tailpipe-mcp/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)