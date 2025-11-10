import { DatabaseService } from "../../../src/services/database.js";
import { createTempInitScript } from "../../helpers/init-script.js";

describe("DatabaseService", () => {
  beforeAll(() => {
    process.env.TAILPIPE_MCP_LOG_LEVEL = "error";
  });

  afterAll(() => {
    delete process.env.TAILPIPE_MCP_LOG_LEVEL;
  });

  it("initializes and executes queries from the init script", async () => {
    const initScript = createTempInitScript(`
      CREATE TABLE tasks (id INTEGER, name VARCHAR);
      INSERT INTO tasks VALUES (1, 'alpha');
      INSERT INTO tasks VALUES (2, 'beta');
    `);

    const service = await DatabaseService.create(initScript.path);
    const rows = await service.executeQuery("SELECT * FROM tasks ORDER BY id");

    expect(rows).toEqual([
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" }
    ]);

    await service.close();
    initScript.cleanup();
  });

  it("throws when the init script contains invalid SQL", async () => {
    const invalidScript = createTempInitScript(`
      CREATE TABLE broken (id INTEGER);
      INVALID STATEMENT;
    `);

    await expect(DatabaseService.create(invalidScript.path)).rejects.toThrow();

    invalidScript.cleanup();
  });

  it("reinitializes when setDatabaseConfig is called with a new script", async () => {
    const firstScript = createTempInitScript(`
      CREATE TABLE original_table (id INTEGER);
      INSERT INTO original_table VALUES (1);
    `);

    const secondScript = createTempInitScript(`
      CREATE TABLE replacement_table (value VARCHAR);
      INSERT INTO replacement_table VALUES ('refreshed');
    `);

    const service = await DatabaseService.create(firstScript.path);

    await service.setDatabaseConfig({
      initScriptPath: secondScript.path,
      sourceType: service.sourceType
    });

    const rows = await service.executeQuery("SELECT * FROM replacement_table");

    expect(rows).toEqual([{ value: "refreshed" }]);

    await service.close();
    firstScript.cleanup();
    secondScript.cleanup();
  });

  it("reconnects automatically if the connection has been closed", async () => {
    const script = createTempInitScript(`
      CREATE TABLE reconnect_test (id INTEGER);
      INSERT INTO reconnect_test VALUES (42);
    `);

    const service = await DatabaseService.create(script.path);
    await service.close();

    const rows = await service.executeQuery("SELECT * FROM reconnect_test");

    expect(rows).toEqual([{ id: 42 }]);

    await service.close();
    script.cleanup();
  });
});

