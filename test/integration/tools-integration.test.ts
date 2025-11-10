import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { DatabaseService } from "../../src/services/database.js";
import { tool as tailpipeQuery } from "../../src/tools/tailpipe_query.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, "..", "fixtures", "init-scripts");

describe("Tool integration with DatabaseService", () => {
  beforeAll(() => {
    process.env.TAILPIPE_MCP_LOG_LEVEL = "error";
  });

  afterAll(() => {
    delete process.env.TAILPIPE_MCP_LOG_LEVEL;
  });

  it("executes tailpipe_query against a real database service", async () => {
    const scriptPath = join(fixturesDir, "simple.sql");
    const service = await DatabaseService.create(scriptPath);

    const result = await tailpipeQuery.handler(service, {
      sql: "SELECT id, name FROM simple_table ORDER BY id"
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: '[{"id":1,"name":"alpha"}]'
        }
      ],
      isError: false
    });

    await service.close();
  });

  it("reloads the database when setDatabaseConfig is called", async () => {
    const initialPath = join(fixturesDir, "simple.sql");
    const replacementPath = join(fixturesDir, "with-comments.sql");
    const service = await DatabaseService.create(initialPath);

    await service.setDatabaseConfig({
      initScriptPath: replacementPath,
      sourceType: service.sourceType
    });

    const rows = await service.executeQuery("SELECT value FROM comment_test");
    expect(rows).toEqual([{ value: "ok" }]);

    await service.close();
  });
});

