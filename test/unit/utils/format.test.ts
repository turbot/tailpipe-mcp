import { formatListResult, stringifyResponse, validateAndFormat } from "../../../src/utils/format.js";

describe("stringifyResponse", () => {
  it("returns compact JSON strings", () => {
    const value = { foo: "bar", nested: { value: 1 } };
    expect(stringifyResponse(value)).toBe('{"foo":"bar","nested":{"value":1}}');
  });
});

describe("validateAndFormat", () => {
  it("parses JSON output and wraps it with debug metadata", () => {
    const raw = JSON.stringify({ id: "abc-123" });
    const result = validateAndFormat(raw, "tailpipe source show test", "source");

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: '{"source":{"id":"abc-123"},"debug":{"command":"tailpipe source show test"}}'
        }
      ]
    });
  });
});

describe("formatListResult", () => {
  it("formats list data with debug information", async () => {
    const data = [
      { name: "alpha" },
      { name: "beta" }
    ];

    const result = await formatListResult(data, "plugins", "tailpipe plugin list");

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: '{"plugins":[{"name":"alpha"},{"name":"beta"}],"debug":{"command":"tailpipe plugin list"}}'
        }
      ]
    });
  });
});

