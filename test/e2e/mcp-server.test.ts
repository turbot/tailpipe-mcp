import { jest } from "@jest/globals";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, "..", "fixtures", "init-scripts");

describe("MCP server startup", () => {
  const originalArgv = process.argv.slice();
  const loggerMock = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  const connectMock = jest.fn();
  const createMock = jest.fn();
  const closeMock = jest.fn().mockResolvedValue(undefined);

  beforeAll(() => {
    process.env.TAILPIPE_MCP_LOG_LEVEL = "error";
  });

  afterAll(() => {
    process.argv = originalArgv;
    delete process.env.TAILPIPE_MCP_LOG_LEVEL;
  });

  beforeEach(() => {
    jest.resetModules();
    connectMock.mockReset().mockResolvedValue(undefined);
    createMock.mockReset();
    closeMock.mockClear();
    Object.values(loggerMock).forEach(fn => fn.mockReset());
  });

  it("initializes the MCP server with registered capabilities", async () => {
    const scriptPath = join(fixturesDir, "simple.sql");
    process.argv = ["node", "index", scriptPath];

    createMock.mockResolvedValue({
      initScriptPath: scriptPath,
      sourceType: "cli-arg",
      close: closeMock,
      setDatabaseConfig: jest.fn(),
      executeQuery: jest.fn()
    });

    const setupToolsMock = jest.fn();
    const setupPromptHandlersMock = jest.fn();
    const setupResourceHandlersMock = jest.fn();
    const setupResourceTemplateHandlersMock = jest.fn();

    class MockServer {
      info: any;
      options: any;
      connect = connectMock;

      constructor(info: any, options: any) {
        this.info = info;
        this.options = options;
      }
    }

    class MockTransport {}

    jest.unstable_mockModule("@modelcontextprotocol/sdk/server/index.js", () => ({
      Server: MockServer
    }));

    jest.unstable_mockModule("@modelcontextprotocol/sdk/server/stdio.js", () => ({
      StdioServerTransport: MockTransport
    }));

    jest.unstable_mockModule("../../src/services/logger.js", () => ({
      logger: loggerMock
    }));

    jest.unstable_mockModule("../../src/services/database.js", () => ({
      DatabaseService: { create: createMock }
    }));

    jest.unstable_mockModule("../../src/tools/index.js", () => ({
      setupTools: setupToolsMock,
      tools: {}
    }));

    jest.unstable_mockModule("../../src/prompts/index.js", () => ({
      setupPromptHandlers: setupPromptHandlersMock,
      promptCapabilities: { prompts: {} }
    }));

    jest.unstable_mockModule("../../src/resources/index.js", () => ({
      setupResourceHandlers: setupResourceHandlersMock,
      resourceCapabilities: { resources: {} }
    }));

    jest.unstable_mockModule("../../src/resourceTemplates/index.js", () => ({
      setupResourceTemplateHandlers: setupResourceTemplateHandlersMock,
      resourceTemplateCapabilities: { resourceTemplates: {} }
    }));

    const modulePromise = import("../../src/index.ts");

    await modulePromise;
    await new Promise(resolve => setImmediate(resolve));

    expect(createMock).toHaveBeenCalledWith(scriptPath);
    expect(setupToolsMock).toHaveBeenCalled();
    expect(setupPromptHandlersMock).toHaveBeenCalled();
    expect(setupResourceHandlersMock).toHaveBeenCalled();
    expect(setupResourceTemplateHandlersMock).toHaveBeenCalled();
    expect(connectMock).toHaveBeenCalledWith(expect.any(MockTransport));
    expect(loggerMock.info).toHaveBeenCalledWith("MCP server started successfully");
  });
});

