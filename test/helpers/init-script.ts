import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface TempScript {
  path: string;
  cleanup: () => void;
}

export function createTempInitScript(contents: string): TempScript {
  const tempDir = mkdtempSync(join(tmpdir(), "tailpipe-mcp-test-"));
  const scriptPath = join(tempDir, "init.sql");

  writeFileSync(scriptPath, contents.trim(), "utf8");

  return {
    path: scriptPath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

