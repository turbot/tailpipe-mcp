import { buildTailpipeCommand, getTailpipeEnv } from "../../../src/utils/tailpipe.js";

describe("buildTailpipeCommand", () => {
  it("constructs basic commands", () => {
    expect(buildTailpipeCommand("source list")).toBe("tailpipe source list");
  });

  it("appends output format when provided", () => {
    expect(buildTailpipeCommand("query run \"SELECT 1\"", { output: "json" })).toBe(
      'tailpipe query run "SELECT 1" --output json'
    );
  });
});

describe("getTailpipeEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CUSTOM_VAR: "value" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("includes existing environment variables and disables update checks", () => {
    const env = getTailpipeEnv();

    expect(env.CUSTOM_VAR).toBe("value");
    expect(env.TAILPIPE_UPDATE_CHECK).toBe("false");
  });
});

