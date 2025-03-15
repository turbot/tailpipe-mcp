#!/usr/bin/env node

import { spawn } from 'child_process';
import { join, resolve } from 'path';

// This script is now a wrapper around Jest, maintained for backward compatibility.
// Prefer using `npm test` directly for running tests.

console.log('🧪 Running all tests with Jest...');

// Run tests through npm's Jest configuration
async function runTests() {
  return new Promise((resolve) => {
    const test = spawn('npm', ['test', '--', '--detectOpenHandles'], {
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    test.on('close', (exitCode) => {
      resolve({ exitCode });
    });
  });
}

// Run cleanup after tests
async function runCleanup() {
  console.log('\n🧹 Running cleanup to remove any leftover test files...');
  
  return new Promise((resolve) => {
    const cleanup = spawn('node', ['tests/cleanup.js'], {
      stdio: 'inherit'
    });
    
    cleanup.on('close', (exitCode) => {
      if (exitCode === 0) {
        console.log('✅ Cleanup completed successfully');
      } else {
        console.error(`⚠️ Cleanup exited with code ${exitCode}`);
      }
      resolve();
    });
  });
}

// Run all tests
runTests()
  .then(({ exitCode }) => {
    return runCleanup().then(() => {
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
  })
  .catch(error => {
    console.error('❌ Test runner failed:', error);
    // Try to run cleanup even if tests fail
    runCleanup().finally(() => process.exit(1));
  });