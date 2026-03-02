import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool, ToolResult, JsonSchema, ToolMetadata } from "../types";

export interface MCPStdioConfig {
  name: string;
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPSSEConfig {
  name: string;
  transport: "sse";
  url: string;
}

export interface MCPStreamableHttpConfig {
  name: string;
  transport: "streamable-http";
  url: string;
}

/**
 * Convenience config: provide just a name + url.
 * Connects via Streamable HTTP first; falls back to SSE if the server
 * doesn't support the newer protocol.
 */
export interface MCPUrlConfig {
  name: string;
  transport: "url";
  url: string;
}

export type MCPServerConfig =
  | MCPStdioConfig
  | MCPSSEConfig
  | MCPStreamableHttpConfig
  | MCPUrlConfig;


class MCPToolAdapter implements Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly metadata: ToolMetadata;

  constructor(
    private client: Client,
    mcpTool: {
      name: string;
      description?: string;
      inputSchema?: unknown;
    },
    serverName: string,
  ) {
    this.name = mcpTool.name;
    this.description = mcpTool.description ?? "";
    this.inputSchema = (mcpTool.inputSchema as JsonSchema) ?? {
      type: "object",
    };
    this.metadata = { source: "mcp", mcpServer: serverName };
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.client.callTool({
        name: this.name,
        arguments: input,
      });

      const output = result.content;
      const isError = result.isError ?? false;

      return {
        success: !isError,
        output,
        ...(isError && { error: JSON.stringify(output) }),
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class MCPClient {
  private client: Client;
  private config: MCPServerConfig;
  private connected = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.client = new Client(
      { name: `agent-mcp-${config.name}`, version: "1.0.0" },
      { capabilities: {} },
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.config.transport === "url") {
      await this.connectWithUrlFallback(this.config.url);
    } else {
      const transport = this.createTransport();
      await this.client.connect(transport);
    }

    this.connected = true;
  }

  async discoverTools(): Promise<Tool[]> {
    if (!this.connected) {
      await this.connect();
    }

    const response = await this.client.listTools();

    return response.tools.map(
      (mcpTool) =>
        new MCPToolAdapter(this.client, mcpTool, this.config.name),
    );
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private createTransport(): Transport {
    switch (this.config.transport) {
      case "stdio":
        return new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env,
        });

      case "sse":
        return new SSEClientTransport(new URL(this.config.url));

      case "streamable-http":
        return new StreamableHTTPClientTransport(new URL(this.config.url));

      default:
        throw new Error(
          `Unsupported MCP transport: ${(this.config as MCPServerConfig).transport}`,
        );
    }
  }

  /**
   * Tries Streamable HTTP first (modern spec), falls back to SSE (legacy).
   * This matches the recommended client behavior from the MCP specification.
   */
  private async connectWithUrlFallback(url: string): Promise<void> {
    const parsedUrl = new URL(url);

    try {
      const transport = new StreamableHTTPClientTransport(parsedUrl);
      await this.client.connect(transport);
    } catch {
      // Streamable HTTP not supported — fall back to SSE.
      // Recreate client since the failed connect may have left it in a bad state.
      this.client = new Client(
        { name: `agent-mcp-${this.config.name}`, version: "1.0.0" },
        { capabilities: {} },
      );
      const sseTransport = new SSEClientTransport(parsedUrl);
      await this.client.connect(sseTransport);
    }
  }
}
