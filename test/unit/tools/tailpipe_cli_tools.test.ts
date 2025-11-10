import { jest } from "@jest/globals";

const executeCommandMock = jest.fn();
const formatCommandErrorMock = jest.fn();
const loggerMock = {
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
};

async function loadTool(modulePath: string) {
  jest.resetModules();
  executeCommandMock.mockReset();
  formatCommandErrorMock.mockReset();
  loggerMock.debug.mockReset();
  loggerMock.info.mockReset();
  loggerMock.error.mockReset();

  jest.unstable_mockModule("../../../src/utils/command.js", () => ({
    executeCommand: executeCommandMock,
    formatCommandError: formatCommandErrorMock,
    MAX_BUFFER_SIZE: 0
  }));

  jest.unstable_mockModule("../../../src/services/logger.js", () => ({
    logger: loggerMock
  }));

  return import(modulePath);
}

describe("Tailpipe list tools", () => {
  const listToolConfigs = [
    {
      module: "../../../src/tools/tailpipe_partition_list.js",
      expectedCommand: "tailpipe partition list --output json",
      key: "partitions",
      raw: [
        {
          name: "partition_a",
          description: "First",
          local: { file_count: 2, file_size: 2048 },
          plugin: "aws"
        },
        {
          name: "partition_b",
          plugin: "gcp"
        }
      ],
      expected: [
        {
          name: "partition_a",
          description: "First",
          local: { file_count: 2, file_size: 2048 },
          plugin: "aws"
        },
        {
          name: "partition_b",
          local: { file_count: 0, file_size: 0 },
          plugin: "gcp"
        }
      ]
    },
    {
      module: "../../../src/tools/tailpipe_table_list.js",
      expectedCommand: "tailpipe table list --output json",
      key: "tables",
      raw: [
        {
          name: "table_a",
          local: { file_count: 1, file_size: 1024 },
          plugin: "aws"
        }
      ],
      expected: [
        {
          name: "table_a",
          local: { file_count: 1, file_size: 1024 },
          plugin: "aws"
        }
      ]
    },
    {
      module: "../../../src/tools/tailpipe_plugin_list.js",
      expectedCommand: "tailpipe plugin list --output json",
      key: "plugins",
      raw: [
        {
          Name: "plugin_a",
          Partitions: ["p1"],
          Version: "1.0"
        },
        {
          Name: null,
          Partitions: "not-array",
          Version: ""
        }
      ],
      expected: [
        {
          Name: "plugin_a",
          Partitions: ["p1"],
          Version: "1.0"
        },
        {
          Name: "",
          Partitions: null,
          Version: ""
        }
      ]
    },
    {
      module: "../../../src/tools/tailpipe_source_list.js",
      expectedCommand: "tailpipe source list --output json",
      key: "sources",
      raw: [
        {
          name: "source_a",
          plugin: "plugin_a",
          description: "desc"
        },
        {
          name: "source_b"
        }
      ],
      expected: [
        {
          name: "source_a",
          plugin: "plugin_a",
          description: "desc"
        },
        {
          name: "source_b"
        }
      ]
    }
  ] as const;

  it.each(listToolConfigs)(
    "$expectedCommand returns formatted output",
    async ({ module, expectedCommand, key, raw, expected }) => {
      const { tool } = await loadTool(module);
      executeCommandMock.mockReturnValue(JSON.stringify(raw));

      const result = await tool.handler();

      expect(executeCommandMock).toHaveBeenCalledWith(expectedCommand, {
        env: expect.any(Object)
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload).toEqual({
        [key]: expected,
        debug: {
          command: expectedCommand
        }
      });
    }
  );

  it("returns formatted error details when the command fails", async () => {
    const { tool } = await loadTool("../../../src/tools/tailpipe_partition_list.js");
    const failure = new Error("cli failed");
    executeCommandMock.mockImplementation(() => {
      throw failure;
    });
    formatCommandErrorMock.mockReturnValue({ isError: true, content: [] });

    const result = await tool.handler();

    expect(formatCommandErrorMock).toHaveBeenCalledWith(
      failure,
      "tailpipe partition list --output json"
    );
    expect(result).toEqual({ isError: true, content: [] });
  });
});

describe("Tailpipe show tools", () => {
  const showToolConfigs = [
    {
      module: "../../../src/tools/tailpipe_partition_show.js",
      args: { name: "partition_a" },
      expectedCommand: 'tailpipe partition show "partition_a" --output json',
      key: "partition"
    },
    {
      module: "../../../src/tools/tailpipe_plugin_show.js",
      args: { name: "plugin_a" },
      expectedCommand: "tailpipe plugin show plugin_a --output json",
      key: "plugin"
    },
    {
      module: "../../../src/tools/tailpipe_source_show.js",
      args: { name: "source_a" },
      expectedCommand: "tailpipe source show source_a --output json",
      key: "source"
    },
    {
      module: "../../../src/tools/tailpipe_table_show.js",
      args: { name: "table_a" },
      expectedCommand: "tailpipe table show table_a --output json",
      key: "table"
    }
  ] as const;

  it.each(showToolConfigs)(
    "$expectedCommand wraps CLI output",
    async ({ module, args, expectedCommand, key }) => {
      const { tool } = await loadTool(module);
      const details = { name: args.name, status: "ok" };
      executeCommandMock.mockReturnValue(JSON.stringify(details));

      const result = await tool.handler(args as any);

      expect(executeCommandMock).toHaveBeenCalledWith(expectedCommand, {
        env: expect.any(Object)
      });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              [key]: details,
              debug: { command: expectedCommand }
            })
          }
        ]
      });
    }
  );

  it("uses formatCommandError when the CLI call throws", async () => {
    const { tool } = await loadTool("../../../src/tools/tailpipe_plugin_show.js");
    const failure = new Error("permission denied");
    executeCommandMock.mockImplementation(() => {
      throw failure;
    });
    formatCommandErrorMock.mockReturnValue({ isError: true, content: [] });

    const result = await tool.handler({ name: "plugin_a" });

    expect(formatCommandErrorMock).toHaveBeenCalledWith(
      failure,
      "tailpipe plugin show plugin_a --output json"
    );
    expect(result).toEqual({ isError: true, content: [] });
  });
});

