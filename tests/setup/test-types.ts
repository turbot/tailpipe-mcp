export interface ContentItem {
  type: string;
  text: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema?: any;
  parameters?: any;
}

export interface ErrorResponse {
  code: number;
  message: string;
}

export interface MCPResponse {
  jsonrpc: string;
  id?: string;
  error?: ErrorResponse;
  result?: {
    content: ContentItem[];
    tools?: Tool[];
    resources?: any[];
    connected?: boolean;
    database_path?: string;
    not_found?: boolean;
    isError?: boolean;
  };
} 