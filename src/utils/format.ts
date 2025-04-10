export function validateAndFormat(output: string, cmd: string, resourceType: string) {
  // Just validate it's valid JSON
  const details = JSON.parse(output);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        [resourceType]: details,
        debug: {
          command: cmd
        }
      }, null, 2)
    }]
  };
} 