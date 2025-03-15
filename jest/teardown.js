// Jest global teardown
export default async function() {
  // Give any asynchronous operations time to complete
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Clean up any open handles
  if (global.gc) {
    // Force garbage collection if available
    global.gc();
  }
  
  console.log('Global teardown executed');
}