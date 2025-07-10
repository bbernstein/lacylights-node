import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { EventEmitter } from 'events';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export class MCPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();

  constructor(private mcpServerPath: string) {
    super();
  }

  async connect(): Promise<void> {
    if (this.process) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.process = spawn('node', ['run-mcp.js'], {
        cwd: this.mcpServerPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      let buffer = '';

      this.process.stdout?.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: MCPResponse = JSON.parse(line);
              this.handleResponse(response);
            } catch (error) {
              console.error('Failed to parse MCP response:', error);
            }
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      this.process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`MCP process exited with code ${code}: ${stderr}`));
        }
      });

      this.process.on('error', (error) => {
        reject(new Error(`Failed to spawn MCP process: ${error.message}`));
      });

      // Initialize connection
      this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'lacylights-node',
          version: '1.0.0'
        }
      }).then(() => {
        resolve();
      }).catch(reject);
    });
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.process) {
      await this.connect();
    }

    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });

    return response.content;
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('MCP process not connected'));
        return;
      }

      const id = ++this.requestId;
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });

      this.process.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  private handleResponse(response: MCPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }
}