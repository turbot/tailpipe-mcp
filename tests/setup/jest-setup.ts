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

// Global afterAll hook to help close any stray resources
afterAll(async () => {
  // Force garbage collection to help release any lingering resources
  if (global.gc) {
    global.gc();
  }
  
  // Small delay to allow any final cleanup to complete
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 100);
    timeout.unref(); // Prevent timer from keeping the process alive
  });
});