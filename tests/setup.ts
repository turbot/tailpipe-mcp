import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Global test setup
beforeAll(() => {
  // Create tmp-test directory if it doesn't exist
  const testDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
});

// Set longer timeout for all tests (10 seconds)
// @ts-ignore
if (typeof jest !== 'undefined') {
  // @ts-ignore 
  jest.setTimeout(10000);
}