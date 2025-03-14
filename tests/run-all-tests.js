#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

// Get the tests directory (where this script is located)
const testsDir = resolve(process.cwd(), 'tests');

// List of test files to run
// We'll exclude some utility/setup files and this runner script
const filesToExclude = ['cleanup.js', 'run-all-tests.js', 'manual-setup.js'];

// Add consolidated test as the first test to run for the most comprehensive coverage
const priorityTests = ['consolidated-test.js'];

// Get all JavaScript files in the tests directory, prioritizing consolidated test
let testFiles = priorityTests
  .filter(file => {
    const fullPath = join(testsDir, file);
    return existsSync(fullPath);
  })
  .map(file => join('tests', file));

// Add remaining tests
const remainingTests = readdirSync(testsDir)
  .filter(file => 
    file.endsWith('.js') && 
    !filesToExclude.includes(file) && 
    !priorityTests.includes(file)
  )
  .map(file => join('tests', file));

testFiles = [...testFiles, ...remainingTests];

console.log('🧪 Running all tests...');
console.log(`📋 Found ${testFiles.length} test files to run:`);
testFiles.forEach(file => console.log(`  - ${file}`));

// Run tests sequentially
async function runTests() {
  let failedTests = [];
  
  for (const testFile of testFiles) {
    console.log(`\n🔬 Running test: ${testFile}`);
    
    try {
      // Make sure the file exists
      const fullPath = resolve(process.cwd(), testFile);
      if (!existsSync(fullPath)) {
        console.error(`❌ Test file does not exist: ${fullPath}`);
        failedTests.push(testFile);
        continue;
      }
      
      // Run the test
      const result = await runTest(testFile);
      if (result.exitCode !== 0) {
        console.error(`❌ Test failed with exit code ${result.exitCode}: ${testFile}`);
        console.error(result.stderr);
        failedTests.push(testFile);
      } else {
        console.log(`✅ Test passed: ${testFile}`);
      }
    } catch (err) {
      console.error(`❌ Error running test ${testFile}:`, err);
      failedTests.push(testFile);
    }
  }
  
  // Print summary
  console.log('\n📊 Test Summary:');
  console.log(`🧪 Total tests: ${testFiles.length}`);
  console.log(`✅ Passed: ${testFiles.length - failedTests.length}`);
  console.log(`❌ Failed: ${failedTests.length}`);
  
  if (failedTests.length > 0) {
    console.log('\n❌ Failed tests:');
    failedTests.forEach(test => console.log(`  - ${test}`));
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
  }
}

// Run a single test file and return the result
function runTest(testFile) {
  return new Promise((resolve) => {
    const test = spawn('node', [testFile], {
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    let stdout = '';
    let stderr = '';
    
    test.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // Pass through to console
      process.stdout.write(output);
    });
    
    test.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      // Pass through to console
      process.stderr.write(output);
    });
    
    test.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// Run cleanup after tests
async function runCleanup() {
  console.log('\n🧹 Running cleanup to remove any leftover test files...');
  
  return new Promise((resolve) => {
    const cleanup = spawn('node', ['tests/cleanup.js'], {
      stdio: 'pipe'
    });
    
    cleanup.stdout.on('data', (data) => {
      process.stdout.write(data.toString());
    });
    
    cleanup.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
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
  .then(() => runCleanup())
  .catch(error => {
    console.error('❌ Test runner failed:', error);
    // Try to run cleanup even if tests fail
    runCleanup().finally(() => process.exit(1));
  });