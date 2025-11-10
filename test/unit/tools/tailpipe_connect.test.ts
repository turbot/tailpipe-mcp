import { jest } from "@jest/globals";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

type LoggerFn = (...args: any[]) => void;
type CreateFn = (path?: string) => Promise<any>;
type FormatErrorFn = (error: unknown, context?: string) => any;

const loggerMock = {
  debug: jest.fn<LoggerFn>(),
  info: jest.fn<LoggerFn>(),
  error: jest.fn<LoggerFn>()
};

const createMock = jest.fn<CreateFn>();
const formatCommandErrorMock = jest.fn<FormatErrorFn>();

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
    const closeNewDb = jest.fn(async () => undefined);
    const { tool } = (await loadTool()) as { tool: Tool };
    const handler = tool.handler as unknown as (db: unknown, args: unknown) => Promise<any>;
    createMock.mockResolvedValue({
      initScriptPath: "/tmp/new.sql",
      sourceType: "tailpipe",
      close: closeNewDb,
      setDatabaseConfig: jest.fn(async () => undefined),
      executeQuery: jest.fn()
    } as any);

    const db = {
      initScriptPath: "/tmp/old.sql",
      sourceType: "cli-arg",
      close: jest.fn(async () => undefined),
      setDatabaseConfig: jest.fn(async (config: { initScriptPath: string; sourceType: string }) => {
        db.initScriptPath = config.initScriptPath;
        db.sourceType = config.sourceType as any;
      })
    };

    const result = await handler(db as any, { init_script_path: "/tmp/request.sql" });

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
    const { tool } = (await loadTool()) as { tool: Tool };
    const handler = tool.handler as unknown as (db: unknown, args: unknown) => Promise<any>;
    createMock.mockRejectedValue(failure);
    formatCommandErrorMock.mockReturnValue({ isError: true, content: [] });
    const db = {
      initScriptPath: "/tmp/old.sql",
      sourceType: "cli-arg",
      close: jest.fn(async () => undefined),
      setDatabaseConfig: jest.fn(async () => undefined)
    };

    const result = await handler(db as any, { init_script_path: "/tmp/new.sql" });

    expect(formatCommandErrorMock).toHaveBeenCalledWith(failure, "connect_tailpipe");
    expect(result).toEqual({ isError: true, content: [] });
  });
});

