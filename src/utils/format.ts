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

export function formatListResult<T>(items: T[], cmd: string, resourceType: string) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        [resourceType]: items,
        debug: {
          command: cmd
        }
      }, null, 2)
    }]
  };
} 