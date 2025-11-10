import { jest } from "@jest/globals";
import { tool as tailpipeQuery } from "../../../src/tools/tailpipe_query.js";

const handler = tailpipeQuery.handler as (db: any, args: { sql: string }) => Promise<any>;

describe("tailpipe_query tool", () => {
  it("returns query results and converts bigints", async () => {
    const executeQuery = jest.fn<(sql: string) => Promise<any[]>>();
    executeQuery.mockResolvedValue([
      { id: BigInt(10), name: "alpha" },
      { id: BigInt(Number.MAX_SAFE_INTEGER + 1), name: "beta" }
    ]);

    const result = await handler(
      { executeQuery } as any,
      { sql: "SELECT id, name FROM test" }
    );

    expect(executeQuery).toHaveBeenCalledWith("SELECT id, name FROM test");
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: '[{"id":10,"name":"alpha"},{"id":"9007199254740992","name":"beta"}]'
        }
      ],
      isError: false
    });
  });

  it("returns an error payload when the query fails", async () => {
    const executeQuery = jest.fn<(sql: string) => Promise<any[]>>();
    executeQuery.mockRejectedValue(new Error("query failed"));

    const result = await handler(
      { executeQuery } as any,
      { sql: "SELECT 1" }
    );

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: '{"error":"query failed"}'
        }
      ],
      isError: true
    });
  });
});

