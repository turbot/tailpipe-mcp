import { jest } from "@jest/globals";

const loggerMock = {
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
};

const createMock = jest.fn();
const formatCommandErrorMock = jest.fn();

async function loadTool() {
  jest.resetModules();
  loggerMock.debug.mockReset();
  loggerMock.info.mockReset();
  loggerMock.error.mockReset();
  createMock.mockReset();
  formatCommandErrorMock.mockReset();

  jest.unstable_mockModule("../../../src/services/database.js", () => ({
    DatabaseService: { create: createMock }
  }));

  jest.unstable_mockModule("../../../src/services/logger.js", () => ({
    logger: loggerMock
  }));

  jest.unstable_mockModule("../../../src/utils/command.js", () => ({
    formatCommandError: formatCommandErrorMock,
    executeCommand: jest.fn(),
    MAX_BUFFER_SIZE: 0
  }));

  return import("../../../src/tools/tailpipe_connect.js");
}

describe("tailpipe_connect tool", () => {
  it("refreshes the database connection with a new script", async () => {
    const closeNewDb = jest.fn().mockResolvedValue(undefined);
    const { tool } = await loadTool();
    createMock.mockResolvedValue({
      initScriptPath: "/tmp/new.sql",
      sourceType: "tailpipe",
      close: closeNewDb
    });

    const db = {
      initScriptPath: "/tmp/old.sql",
      sourceType: "cli-arg",
      close: jest.fn().mockResolvedValue(undefined),
      setDatabaseConfig: jest.fn().mockImplementation(async (config: { initScriptPath: string; sourceType: string }) => {
        db.initScriptPath = config.initScriptPath;
        db.sourceType = config.sourceType as any;
      })
    };

    const result = await tool.handler(db as any, { init_script_path: "/tmp/request.sql" });

    expect(db.close).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith("/tmp/request.sql");
    expect(db.setDatabaseConfig).toHaveBeenCalledWith({
      initScriptPath: "/tmp/new.sql",
      sourceType: "tailpipe"
    });
    expect(closeNewDb).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.connection).toEqual({
      success: true,
      init_script_path: "/tmp/new.sql",
      source: "tailpipe CLI",
      status: "connected"
    });
  });

  it("delegates error formatting when initialization fails", async () => {
    const failure = new Error("create failed");
    const { tool } = await loadTool();
    createMock.mockRejectedValue(failure);
    formatCommandErrorMock.mockReturnValue({ isError: true, content: [] });
    const db = {
      initScriptPath: "/tmp/old.sql",
      sourceType: "cli-arg",
      close: jest.fn().mockResolvedValue(undefined),
      setDatabaseConfig: jest.fn().mockResolvedValue(undefined)
    };

    const result = await tool.handler(db as any, { init_script_path: "/tmp/new.sql" });

    expect(formatCommandErrorMock).toHaveBeenCalledWith(failure, "connect_tailpipe");
    expect(result).toEqual({ isError: true, content: [] });
  });
});

