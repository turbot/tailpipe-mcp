import { jest } from "@jest/globals";

const execSyncMock = jest.fn();

async function importCommandModule() {
  jest.resetModules();

  jest.unstable_mockModule("node:child_process", () => ({
    execSync: execSyncMock
  }));

  return import("../../../src/utils/command.js");
}

describe("executeCommand", () => {
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    execSyncMock.mockReset();
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  afterEach(() => {
    delete process.env.TAILPIPE_MCP_MEMORY_MAX_MB;
  });

  it("executes a command with default options", async () => {
    const { executeCommand, MAX_BUFFER_SIZE } = await importCommandModule();
    execSyncMock.mockReturnValue("result");

    const output = executeCommand("echo test");

    expect(output).toBe("result");
    expect(execSyncMock).toHaveBeenCalledWith(
      "echo test",
      expect.objectContaining({
        encoding: "utf-8",
        env: expect.any(Object),
        maxBuffer: MAX_BUFFER_SIZE
      })
    );
  });

  it("uses the configured max buffer when provided via options", async () => {
    const { executeCommand } = await importCommandModule();
    execSyncMock.mockReturnValue("ok");

    executeCommand("echo ok", { maxBuffer: 10 });

    expect(execSyncMock).toHaveBeenCalledWith(
      "echo ok",
      expect.objectContaining({
        maxBuffer: 10
      })
    );
  });

  it("calculates MAX_BUFFER_SIZE from environment variable", async () => {
    process.env.TAILPIPE_MCP_MEMORY_MAX_MB = "200";
    const { MAX_BUFFER_SIZE } = await importCommandModule();

    expect(MAX_BUFFER_SIZE).toBe(200 * 1024 * 1024);
  });

  it("throws a detailed error when execSync fails", async () => {
    const thrown: any = new Error("failure");
    thrown.stdout = Buffer.from("std out");
    thrown.stderr = Buffer.from("std err");
    thrown.code = 1;
    thrown.signal = "SIGTERM";

    const { executeCommand } = await importCommandModule();
    execSyncMock.mockImplementation(() => {
      throw thrown;
    });

    expect(() => executeCommand("bad command")).toThrowErrorMatchingInlineSnapshot(`
"Error: std err
Exit code: 1
Signal: SIGTERM
Command: bad command"
`);
  });
});

describe("formatCommandError", () => {
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    execSyncMock.mockReset();
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it("formats syntax errors from JSON parsing", async () => {
    const { formatCommandError } = await importCommandModule();
    const error = new SyntaxError("Unexpected token");

    const result = formatCommandError(error, "tailpipe command");

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Failed to parse Tailpipe CLI output: Unexpected token. Command: tailpipe command"
        }
      ]
    });
  });

  it("formats command execution errors with details", async () => {
    const { formatCommandError } = await importCommandModule();
    const cmdError: any = new Error("failed");
    cmdError.stderr = "Permission denied";
    cmdError.code = 126;
    cmdError.signal = "SIGTERM";
    cmdError.cmd = "tailpipe source list";

    const result = formatCommandError(cmdError);

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Failed to run Tailpipe CLI:\nError: Permission denied\nExit code: 126\nSignal: SIGTERM\nCommand: tailpipe source list"
        }
      ]
    });
  });

  it("handles generic errors gracefully", async () => {
    const { formatCommandError } = await importCommandModule();
    const error = new Error("something went wrong");

    const result = formatCommandError(error);

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "something went wrong"
        }
      ]
    });
  });
});

