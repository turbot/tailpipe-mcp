#!/usr/bin/env node

import { existsSync, rmSync } from 'fs';
import { join } from 'path';

// Helper script to clean up any test files that might have been left behind
console.log('🧹 Cleaning up temporary test files...');

const tempDir = join(process.cwd(), '.tmp-test');

if (existsSync(tempDir)) {
  try {
    rmSync(tempDir, { recursive: true, force: true });
    console.log(`✅ Successfully removed test directory: ${tempDir}`);
  } catch (err) {
    console.error(`❌ Failed to remove test directory: ${err.message}`);
  }
} else {
  console.log('✅ No temporary test directory found, nothing to clean up.');
}

// Check for any stray DB files in the project root
console.log('🔍 Checking for stray database files...');
try {
  // We intentionally don't implement this to avoid accidentally deleting user files
  // If needed, you can manually delete any *.db files in the project root
  console.log('ℹ️ To remove any stray database files in the project root, run:');
  console.log('   rm -f *.db');
} catch (err) {
  console.error(`❌ Error: ${err.message}`);
}

console.log('🧹 Cleanup complete');