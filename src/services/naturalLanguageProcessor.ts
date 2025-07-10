import { join } from 'path';
import { MCPClient } from './mcpClient';

interface MCPOperation {
  type: string;
  result?: any;
  error?: string;
}

export interface NaturalLanguageCommandResponse {
  success: boolean;
  message: string;
  operations: MCPOperation[];
}

export class NaturalLanguageProcessor {
  private mcpClient: MCPClient;

  constructor() {
    // Path to the MCP server relative to the Node.js backend
    const mcpServerPath = join(__dirname, '../../../lacylights-mcp');
    this.mcpClient = new MCPClient(mcpServerPath);
  }

  async processCommand(command: string, projectId?: string): Promise<NaturalLanguageCommandResponse> {
    try {
      // Analyze the command to determine what operations to perform
      const analysis = await this.analyzeCommand(command);
      
      // Execute the determined operations
      const operations: MCPOperation[] = [];
      
      for (const operation of analysis.operations) {
        try {
          const result = await this.executeMCPOperation(operation, projectId);
          operations.push({
            type: operation.type,
            result: result
          });
        } catch (error) {
          operations.push({
            type: operation.type,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return {
        success: operations.some(op => !op.error),
        message: analysis.message,
        operations
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to process command: ${error instanceof Error ? error.message : String(error)}`,
        operations: []
      };
    }
  }

  private async analyzeCommand(command: string): Promise<{
    message: string;
    operations: Array<{
      type: string;
      params: Record<string, any>;
    }>;
  }> {
    const lowerCommand = command.toLowerCase();
    
    // Pattern matching for different command types
    if (lowerCommand.includes('create') && lowerCommand.includes('project')) {
      return this.analyzeCreateProjectCommand(command);
    }
    
    if (lowerCommand.includes('add') && lowerCommand.includes('fixture')) {
      return this.analyzeAddFixtureCommand(command);
    }
    
    if (lowerCommand.includes('create') && lowerCommand.includes('scene')) {
      return this.analyzeCreateSceneCommand(command);
    }
    
    if (lowerCommand.includes('make') && (lowerCommand.includes('blue') || lowerCommand.includes('red') || lowerCommand.includes('green'))) {
      return this.analyzeColorCommand(command);
    }
    
    if (lowerCommand.includes('turn') && (lowerCommand.includes('on') || lowerCommand.includes('off'))) {
      return this.analyzePowerCommand(command);
    }

    // Default response for unrecognized commands
    return {
      message: "I'm not sure how to handle that command. Try something like 'Create a new project' or 'Make all fixtures blue'.",
      operations: []
    };
  }

  private async analyzeCreateProjectCommand(command: string): Promise<{
    message: string;
    operations: Array<{ type: string; params: any }>;
  }> {
    // Extract project name from command
    const nameMatch = command.match(/create.*project.*?(?:called|named|with name)?\s*["']?([^"']+)["']?/i);
    const name = nameMatch ? nameMatch[1].trim() : 'New Project';
    
    // Check if fixtures are mentioned
    const fixtureMatch = command.match(/(\d+)\s+(?:fixtures?|lights?)\s+(?:from\s+)?(?:manufacturer\s+)?([^,\s]+)\s+(?:model\s+)?([^,\s]+)/i);
    
    const operations: Array<{
      type: string;
      params: Record<string, any>;
    }> = [
      {
        type: 'create_project',
        params: {
          name,
          description: `Project created via natural language command: ${command}`
        }
      }
    ];

    if (fixtureMatch) {
      const count = parseInt(fixtureMatch[1]);
      const manufacturer = fixtureMatch[2];
      const model = fixtureMatch[3];
      
      for (let i = 0; i < count; i++) {
        operations.push({
          type: 'create_fixture_instance',
          params: {
            name: `${manufacturer} ${model} ${i + 1}`,
            manufacturer,
            model,
            channelAssignment: 'auto'
          }
        });
      }
    }

    return {
      message: `I'll create a project named "${name}"${fixtureMatch ? ` with ${fixtureMatch[1]} ${fixtureMatch[2]} ${fixtureMatch[3]} fixtures` : ''}.`,
      operations
    };
  }

  private async analyzeAddFixtureCommand(command: string): Promise<{
    message: string;
    operations: Array<{ type: string; params: Record<string, any> }>;
  }> {
    const fixtureMatch = command.match(/(\d+)\s+(?:fixtures?|lights?)\s+(?:from\s+)?(?:manufacturer\s+)?([^,\s]+)\s+(?:model\s+)?([^,\s]+)/i);
    
    if (!fixtureMatch) {
      return {
        message: "I couldn't understand the fixture details. Please specify something like 'add 5 fixtures from Chauvet model SlimPAR'.",
        operations: []
      };
    }

    const count = parseInt(fixtureMatch[1]);
    const manufacturer = fixtureMatch[2];
    const model = fixtureMatch[3];
    
    const operations = [];
    for (let i = 0; i < count; i++) {
      operations.push({
        type: 'create_fixture_instance',
        params: {
          name: `${manufacturer} ${model} ${i + 1}`,
          manufacturer,
          model,
          channelAssignment: 'auto'
        }
      });
    }

    return {
      message: `I'll add ${count} ${manufacturer} ${model} fixtures to the project.`,
      operations
    };
  }

  private async analyzeCreateSceneCommand(command: string): Promise<{
    message: string;
    operations: Array<{ type: string; params: Record<string, any> }>;
  }> {
    // Extract scene name
    const nameMatch = command.match(/create.*scene.*?(?:called|named|with name)?\s*["']?([^"']+)["']?/i);
    const name = nameMatch ? nameMatch[1].trim() : 'New Scene';
    
    // Extract color information
    const colorMatch = command.match(/(blue|red|green|white|amber|purple|yellow|orange|pink)/i);
    const color = colorMatch ? colorMatch[1].toLowerCase() : 'white';
    
    return {
      message: `I'll create a scene named "${name}" with ${color} lighting.`,
      operations: [
        {
          type: 'generate_scene',
          params: {
            sceneDescription: `${name} - ${color} lighting scene created via natural language`,
            designPreferences: {
              colorPalette: [color],
              intensity: 'moderate',
              mood: 'neutral'
            }
          }
        }
      ]
    };
  }

  private async analyzeColorCommand(command: string): Promise<{
    message: string;
    operations: Array<{ type: string; params: Record<string, any> }>;
  }> {
    const colorMatch = command.match(/(blue|red|green|white|amber|purple|yellow|orange|pink)/i);
    const color = colorMatch ? colorMatch[1].toLowerCase() : 'white';
    
    return {
      message: `I'll create a scene to make all fixtures ${color}.`,
      operations: [
        {
          type: 'generate_scene',
          params: {
            sceneDescription: `All fixtures ${color} - created via natural language`,
            designPreferences: {
              colorPalette: [color],
              intensity: 'moderate',
              mood: 'neutral'
            }
          }
        }
      ]
    };
  }

  private async analyzePowerCommand(command: string): Promise<{
    message: string;
    operations: Array<{ type: string; params: Record<string, any> }>;
  }> {
    const isOn = command.toLowerCase().includes('on');
    
    return {
      message: `I'll turn all fixtures ${isOn ? 'on' : 'off'}.`,
      operations: [
        {
          type: 'generate_scene',
          params: {
            sceneDescription: `All fixtures ${isOn ? 'on' : 'off'} - created via natural language`,
            designPreferences: {
              intensity: isOn ? 'moderate' : 'subtle',
              mood: 'neutral'
            }
          }
        }
      ]
    };
  }

  private async executeMCPOperation(operation: { type: string; params: Record<string, any> }, projectId?: string): Promise<any> {
    // Add projectId to params if provided and not already present
    if (projectId && !operation.params.projectId) {
      operation.params.projectId = projectId;
    }

    try {
      const result = await this.mcpClient.callTool(operation.type, operation.params);
      return result;
    } catch (error) {
      throw new Error(`MCP operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}