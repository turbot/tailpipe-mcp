import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { DatabaseService } from "../../src/services/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, "..", "fixtures", "init-scripts");

describe("DatabaseService integration", () => {
  beforeAll(() => {
    process.env.TAILPIPE_MCP_LOG_LEVEL = "error";
  });

  afterAll(() => {
    delete process.env.TAILPIPE_MCP_LOG_LEVEL;
  });

  it("executes init scripts containing semicolons inside string literals", async () => {
    const scriptPath = join(fixturesDir, "with-string-semicolons.sql");
    const service = await DatabaseService.create(scriptPath);

    const rows = await service.executeQuery(
      "SELECT body FROM message_test ORDER BY body"
    );

    expect(rows).toEqual([
      { body: "hello; world" },
      { body: "path;to;resource" }
    ]);

    await service.close();
  });

  it("processes init scripts with line and block comments", async () => {
    const scriptPath = join(fixturesDir, "with-comments.sql");
    const service = await DatabaseService.create(scriptPath);

    const rows = await service.executeQuery("SELECT value FROM comment_test");

    expect(rows).toEqual([{ value: "ok" }]);

    await service.close();
  });
});

