import { parseSqlStatements } from "../../../src/services/database.js";

describe("parseSqlStatements", () => {
  it("splits simple statements into separate queries", () => {
    const script = `
      CREATE TABLE foo (id INT);
      INSERT INTO foo VALUES (1);
    `;

    const statements = parseSqlStatements(script);

    expect(statements).toEqual([
      'CREATE TABLE "foo" (id INT)',
      'INSERT INTO "foo" VALUES (1)'
    ]);
  });

  it("preserves semicolons within string literals", () => {
    const script = `
      INSERT INTO messages (body) VALUES ('text; with semicolon');
      SELECT * FROM messages;
    `;

    const statements = parseSqlStatements(script);

    expect(statements).toEqual([
      'INSERT INTO "messages" (body) VALUES (\'text; with semicolon\')',
      'SELECT * FROM "messages"'
    ]);
  });

  it("ignores semicolons within comments", () => {
    const script = `
      -- this comment has a semicolon;
      CREATE TABLE foo (id INT);
      /* another comment; with semicolon */
      INSERT INTO foo VALUES (2);
    `;

    const statements = parseSqlStatements(script);

    expect(statements).toEqual([
      'CREATE TABLE "foo" (id INT)',
      'INSERT INTO "foo" VALUES (2)'
    ]);
  });

  it("falls back to regex splitting for unsupported statements", () => {
    const script = `
      INSTALL httpfs;
      LOAD httpfs;
    `;

    const statements = parseSqlStatements(script);

    expect(statements).toEqual([
      "INSTALL httpfs",
      "LOAD httpfs"
    ]);
  });

  it("returns an empty array for empty scripts", () => {
    const statements = parseSqlStatements("   \n  ");
    expect(statements).toEqual([]);
  });
});

