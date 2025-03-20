export interface ContentItem {
  type: string;
  text: string;
}

export interface Tool {
  name: string;
  description: string;
}

export interface MCPResponse {
  error?: {
    code: number;
    message: string;
  };
  result?: {
    content: ContentItem[];
    isError?: boolean;
    tools?: Tool[];
  };
} 