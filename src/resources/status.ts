import { DatabaseService } from "../services/database.js";
import { execSync } from "child_process";

// Define a function to handle status resource requests
export async function handleStatusResource(uri: string, db: DatabaseService): Promise<any | null> {
  // Check if this is a status resource URI
  if (uri !== 'tailpipe://status') {
    return null;
  }
  
  // Get the database path from the DatabaseService
  const dbPath = (db as any).databasePath || 'Unknown';
  
  // Get Tailpipe CLI version (when available)
  let tailpipeVersion = 'Not installed';
  try {
    const output = execSync('tailpipe version --output json', { encoding: 'utf-8' });
    try {
      const result = JSON.parse(output);
      tailpipeVersion = result.version || 'Unknown';
    } catch (parseError) {
      tailpipeVersion = 'Error parsing version';
    }
  } catch (error) {
    // Tailpipe CLI is not installed or failed to run
    tailpipeVersion = 'Not installed or failed to run';
  }
  
  // Get connection status
  let connectionStatus = "Unknown";
  try {
    // Try a simple query to test the connection
    await db.executeQuery("SELECT 1");
    connectionStatus = "Connected";
  } catch (error) {
    connectionStatus = "Disconnected";
  }
  
  // Prepare the status response
  const content = {
    database: {
      path: dbPath,
      connection_status: connectionStatus
    },
    tailpipe: {
      version: tailpipeVersion
    },
    mcp_server: {
      version: "0.1.0", // Matches the version in package.json
      start_time: process.env.SERVER_START_TIME || new Date().toISOString()
    }
  };
  
  return {
    contents: [
      {
        uri: uri,
        mimeType: "application/json",
        text: JSON.stringify(content, null, 2)
      }
    ]
  };
}