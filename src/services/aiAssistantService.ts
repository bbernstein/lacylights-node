import { MCPClient } from './mcpClient';
import { join } from 'path';

interface LLMProvider {
  name: string;
  apiKey?: string;
  endpoint?: string;
  model: string;
}

interface AIOperation {
  type: string;
  result?: any;
  error?: string;
}

export interface AIAssistantResponse {
  success: boolean;
  message: string;
  operations: AIOperation[];
}

interface ApplicationContext {
  projectId?: string;
  projectName?: string;
  currentMode?: 'fixtures' | 'scenes' | 'cues' | 'overview';
  availableFixtures?: Array<{
    id: string;
    name: string;
    manufacturer: string;
    model: string;
    type: string;
  }>;
  availableScenes?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  availableCueLists?: Array<{
    id: string;
    name: string;
    cueCount: number;
  }>;
}

interface LLMResponse {
  reasoning: string;
  message: string;
  operations: Array<{
    type: string;
    params: Record<string, any>;
    reasoning: string;
  }>;
}

export class AIAssistantService {
  private mcpClient: MCPClient;
  private llmProvider: LLMProvider;
  private lastApiCall: number = 0;
  private readonly minApiInterval: number = 1000; // 1 second between API calls

  constructor() {
    const mcpServerPath = join(__dirname, '../../../lacylights-mcp');
    this.mcpClient = new MCPClient(mcpServerPath);
    
    // Configure LLM provider from environment variables
    this.llmProvider = this.configureLLMProvider();
  }

  private configureLLMProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER || 'claude';
    
    console.log('Configuring LLM Provider:', {
      provider,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      anthropicKeyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...',
      claudeModel: process.env.CLAUDE_MODEL
    });
    
    switch (provider.toLowerCase()) {
      case 'claude':
        return {
          name: 'claude',
          apiKey: process.env.ANTHROPIC_API_KEY,
          endpoint: 'https://api.anthropic.com/v1/messages',
          model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229'
        };
      case 'openai':
        return {
          name: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          endpoint: 'https://api.openai.com/v1/chat/completions',
          model: process.env.OPENAI_MODEL || 'gpt-4'
        };
      case 'local':
        return {
          name: 'local',
          endpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/generate',
          model: process.env.LOCAL_LLM_MODEL || 'llama2'
        };
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  private handleSimpleContextQuestions(command: string, context: ApplicationContext): AIAssistantResponse | null {
    // Always use LLM for all requests - no keyword matching
    return null;
  }

  async processCommand(
    command: string, 
    context: ApplicationContext = {}
  ): Promise<AIAssistantResponse> {
    try {
      // Check if this is a simple question that can be answered directly from context
      const simpleResponse = this.handleSimpleContextQuestions(command, context);
      if (simpleResponse) {
        return simpleResponse;
      }
      
      // Build context-aware prompt
      const systemPrompt = this.buildSystemPrompt(context);
      
      // Call LLM to analyze command and plan operations
      const llmResponse = await this.callLLM(systemPrompt, command);
      
      // Execute the planned operations
      const operations: AIOperation[] = [];
      let enhancedMessage = llmResponse.message;
      
      if (llmResponse.operations && llmResponse.operations.length > 0) {
        for (const operation of llmResponse.operations) {
          try {
            const result = await this.executeMCPOperation(operation, context.projectId);
            operations.push({
              type: operation.type,
              result: typeof result === 'string' ? result : JSON.stringify(result)
            });
            
            // If there's operation result data, ask AI to analyze and present it
            if (result) {
              const analysisPrompt = `The user asked: "${command}"
              
You executed the operation "${operation.type}" and got this result:
${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}

Please analyze this result and provide a clear, user-friendly answer to the user's original question. 

If the user asked about channels on a fixture:
- List each channel name clearly
- Include channel offset/number if available
- Mention channel type (RED, GREEN, BLUE, INTENSITY, etc.)
- Provide any relevant details about the fixture's capabilities

If the user asked about fixtures:
- Provide the specific details they requested
- Format the information in a readable way

If the user asked about scenes or cues:
- Extract and present the relevant information clearly

Respond with ONLY the analyzed answer in plain text, no JSON, no operation details, just the direct answer to their question.`;

              try {
                const analysis = await this.callLLMForAnalysis(analysisPrompt);
                if (analysis && analysis.trim()) {
                  enhancedMessage = analysis;
                }
              } catch (error) {
                // If analysis fails, fall back to original message
                console.warn('Failed to analyze operation result:', error);
                // For rate limiting errors, don't retry
                if (error instanceof Error && error.message.includes('Too Many Requests')) {
                  enhancedMessage = `Operation completed successfully, but couldn't analyze results due to rate limits. Raw result: ${typeof result === 'string' ? result : JSON.stringify(result)}`;
                }
              }
            }
          } catch (error) {
            operations.push({
              type: operation.type,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      return {
        success: operations.length === 0 ? true : operations.some(op => !op.error),
        message: enhancedMessage,
        operations
      };
    } catch (error) {
      return {
        success: false,
        message: `AI Assistant error: ${error instanceof Error ? error.message : String(error)}`,
        operations: []
      };
    }
  }

  private buildSystemPrompt(context: ApplicationContext): string {
    const basePrompt = `You are an AI assistant for LacyLights, a professional theatre lighting control system. You help users control lighting fixtures, create scenes, manage cue lists, and operate their lighting rigs through natural language commands.

## Your Capabilities
You can perform these operations through the MCP (Model Context Protocol) server:

### Project Management
- list_projects: List all lighting projects
- create_project: Create new lighting projects
- get_project_details: Get detailed project information
- delete_project: Delete projects (with confirmation)

### Fixture Management
- get_fixture_inventory: Get available fixture types and instances
- create_fixture_instance: Add new fixture instances to projects
- update_fixture_instance: Modify existing fixtures
- analyze_fixture_capabilities: Understand what fixtures can do (channels, capabilities, etc.)
- get_channel_map: See DMX channel assignments and usage across project
- suggest_channel_assignment: Get optimal channel layouts

IMPORTANT: When users ask about channels on a specific fixture, use analyze_fixture_capabilities with the fixture ID, not get_channel_map. The analyze_fixture_capabilities operation will give you detailed channel information for that specific fixture.

NOTE: If a user asks about a fixture by name (like "par3"), you need to look at the available fixtures in the context to find the correct fixture ID, then use that ID in the analyze_fixture_capabilities operation. Do not use the fixture name as the fixture ID.

### Scene Creation & Management
- generate_scene: Create lighting scenes with AI assistance
- update_scene: Modify existing scenes (use fixtureValues array with fixtureId and channelValues)
- optimize_scene: Improve scenes for specific goals
- analyze_script: Extract lighting cues from theatrical scripts

### Cue List Management
- create_cue_sequence: Create sequences of lighting cues
- generate_act_cues: Generate cues for entire acts
- add_cue_to_list, remove_cue_from_list: Manage individual cues
- update_cue, reorder_cues: Modify cue properties and order
- get_cue_list_details: Analyze and query cue lists
- optimize_cue_timing: Improve cue timing and transitions

## CRITICAL: Response Format
You MUST respond with ONLY valid JSON. No explanations, no text before or after. Just pure JSON.
Do NOT include any markdown formatting, code blocks, explanatory text, or COMMENTS in the JSON.
JSON does not support comments (// or /* */). Start your response with { and end with }.

Format (exactly this structure):
{
  "reasoning": "Your step-by-step thinking about what the user wants",
  "message": "User-friendly response explaining what you'll do or answering their question",
  "operations": [
    {
      "type": "mcp_operation_name",
      "params": { "param1": "value1", "param2": "value2" },
      "reasoning": "Why this operation is needed"
    }
  ]
}

FIXTURE LOOKUP: If user mentions a fixture by name (like "par3"), find the fixture ID from the availableFixtures list in the context, then use that ID in your operations.

IMPORTANT: If the user is asking a question that can be answered directly from the context data (like "how many fixtures do I have?" or "what is the scene ID for X?"), provide the answer in the message field and use an empty operations array. Only use operations when you need to create, modify, or fetch additional data.

FIXTURE LOOKUP: When users ask about a specific fixture by name, look at the availableFixtures in the context to find the fixture ID. The context includes fixture names, IDs, manufacturer, model, and type. Use the fixture ID (not the name) for MCP operations.

SCENE LOOKUP: When users refer to a scene by name OR description, look at the availableScenes in the context to find the scene ID. The context includes scene names, IDs, and descriptions. Match scenes by:
1. Exact name match (e.g., "King Duncan's Court")
2. Description match (e.g., "the scene with green lighting on the left" should match "King Duncan's Court" scene)
3. Partial name match (e.g., "Duncan" should match "King Duncan's Court")

CRITICAL: For any operation that requires a sceneId (like update_scene), you MUST find the scene ID from the availableScenes context before executing the operation. Never leave sceneId undefined or empty.

EXAMPLE: If user says "update the scene with green lighting on the left side" and you see in context:
• "King Duncan's Court" (ID: scene_123) - King Duncan's court with GREEN lighting on the left side
Then use sceneId: "scene_123" in your operation.

UPDATE_SCENE FORMAT: Use this exact structure for update_scene operations:
{
  "type": "update_scene",
  "params": {
    "sceneId": "scene_id_here",
    "fixtureValues": [
      {
        "fixtureId": "fixture_id_here",
        "channelValues": [255, 255, 255, 100]
      }
    ]
  }
}

CUE LIST LOOKUP: When users ask for cue list information by name, look at the availableCueLists in the context. The context includes cue list names, IDs, and cue counts.`;

    // Add current context
    let contextInfo = "\n## Current Context\n";
    
    if (context.projectId && context.projectName) {
      contextInfo += `- Current Project: "${context.projectName}" (ID: ${context.projectId})\n`;
    } else {
      contextInfo += "- No project currently selected\n";
    }
    
    if (context.currentMode) {
      contextInfo += `- Current Mode: ${context.currentMode}\n`;
    }

    if (context.availableFixtures && context.availableFixtures.length > 0) {
      contextInfo += `- Available Fixtures: ${context.availableFixtures.length} fixtures in project\n`;
      contextInfo += context.availableFixtures.slice(0, 5).map(f => 
        `  • ${f.name} (ID: ${f.id}) - ${f.manufacturer} ${f.model}`
      ).join('\n') + '\n';
      if (context.availableFixtures.length > 5) {
        contextInfo += `  • ... and ${context.availableFixtures.length - 5} more\n`;
      }
    }

    if (context.availableScenes && context.availableScenes.length > 0) {
      contextInfo += `- Available Scenes: ${context.availableScenes.length} scenes\n`;
      contextInfo += context.availableScenes.map(s => 
        `  • "${s.name}" (ID: ${s.id})${s.description ? ` - ${s.description}` : ''}`
      ).join('\n') + '\n';
    }

    if (context.availableCueLists && context.availableCueLists.length > 0) {
      contextInfo += `- Available Cue Lists: ${context.availableCueLists.length} cue lists\n`;
      contextInfo += context.availableCueLists.map(cl => 
        `  • "${cl.name}" (${cl.cueCount} cues)`
      ).join('\n') + '\n';
    }

    const modeSpecificGuidance = this.getModeSpecificGuidance(context.currentMode);

    return basePrompt + contextInfo + modeSpecificGuidance;
  }

  private getModeSpecificGuidance(mode?: string): string {
    switch (mode) {
      case 'fixtures':
        return `\n## Fixture Mode Guidance
You're in Fixture Management mode. Users likely want to:
- Add new fixtures to the project
- Modify existing fixture properties
- Organize fixtures by tags or positions
- Check DMX channel assignments
- Analyze fixture capabilities`;

      case 'scenes':
        return `\n## Scene Mode Guidance
You're in Scene Management mode. Users likely want to:
- Create new lighting scenes
- Modify existing scene lighting
- Set specific colors, intensities, or effects
- Optimize scenes for different purposes
- Copy or adapt existing scenes`;

      case 'cues':
        return `\n## Cue List Mode Guidance
You're in Cue Management mode. Users likely want to:
- Create or modify cue sequences
- Adjust timing and transitions
- Add new cues to existing lists
- Reorder or remove cues
- Optimize cue timing for performances`;

      default:
        return `\n## General Mode
You're in the main overview. Users might want to:
- Get project status and information
- Create new projects or switch projects
- Get overviews of fixtures, scenes, or cues
- Perform any general lighting operations`;
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.minApiInterval) {
      const waitTime = this.minApiInterval - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastApiCall = Date.now();
  }

  private async callLLM(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    await this.waitForRateLimit();
    
    switch (this.llmProvider.name) {
      case 'claude':
        return this.callClaude(systemPrompt, userMessage);
      case 'openai':
        return this.callOpenAI(systemPrompt, userMessage);
      case 'local':
        return this.callLocalLLM(systemPrompt, userMessage);
      default:
        throw new Error(`Unsupported LLM provider: ${this.llmProvider.name}`);
    }
  }

  private async callLLMForAnalysis(prompt: string): Promise<string> {
    await this.waitForRateLimit();
    
    switch (this.llmProvider.name) {
      case 'claude':
        return this.callClaudeForAnalysis(prompt);
      case 'openai':
        return this.callOpenAIForAnalysis(prompt);
      case 'local':
        return this.callLocalLLMForAnalysis(prompt);
      default:
        throw new Error(`Unsupported LLM provider: ${this.llmProvider.name}`);
    }
  }

  private async callClaude(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    const response = await fetch(this.llmProvider.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.llmProvider.apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.llmProvider.model,
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Claude API Error Details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        endpoint: this.llmProvider.endpoint,
        model: this.llmProvider.model,
        hasApiKey: !!this.llmProvider.apiKey
      });
      throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json() as any;
    const content = data.content[0].text;
    
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('Claude JSON parsing error:', error);
      console.error('Claude response content:', content);
      
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          // Remove JavaScript-style comments that make JSON invalid
          const cleanedJSON = jsonMatch[0]
            .replace(/\/\/.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .replace(/,\s*}/g, '}') // Remove trailing commas before closing braces
            .replace(/,\s*]/g, ']'); // Remove trailing commas before closing brackets
          
          const parsedJSON = JSON.parse(cleanedJSON);
          console.log('Successfully extracted and cleaned JSON from Claude response');
          return parsedJSON;
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError);
        }
      }
      
      // If all else fails, create a fallback JSON response
      return {
        reasoning: "Claude returned non-JSON response, creating fallback",
        message: "I apologize, but I had trouble processing your request. Please try rephrasing your command.",
        operations: []
      };
    }
  }

  private async callOpenAI(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    const response = await fetch(this.llmProvider.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.llmProvider.apiKey}`
      },
      body: JSON.stringify({
        model: this.llmProvider.model,
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nRemember: Your response must be valid JSON. Start with { and end with }.'
          },
          {
            role: 'user',
            content: userMessage + '\n\nPlease respond with valid JSON only.'
          }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const content = data.choices[0].message.content;
    
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('OpenAI JSON parsing error:', error);
      console.error('OpenAI response content:', content);
      
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError);
        }
      }
      
      // If all else fails, create a fallback JSON response
      return {
        reasoning: "OpenAI returned non-JSON response, creating fallback",
        message: content.trim(),
        operations: []
      };
    }
  }

  private async callLocalLLM(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    // For local LLMs like Ollama
    const response = await fetch(this.llmProvider.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.llmProvider.model,
        prompt: `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Local LLM error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const content = data.response;
    
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse local LLM response as JSON: ${content}`);
    }
  }

  private async callClaudeForAnalysis(prompt: string): Promise<string> {
    const response = await fetch(this.llmProvider.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.llmProvider.apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.llmProvider.model,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.content[0].text;
  }

  private async callOpenAIForAnalysis(prompt: string): Promise<string> {
    const response = await fetch(this.llmProvider.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.llmProvider.apiKey}`
      },
      body: JSON.stringify({
        model: this.llmProvider.model,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  private async callLocalLLMForAnalysis(prompt: string): Promise<string> {
    const response = await fetch(this.llmProvider.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.llmProvider.model,
        prompt: `${prompt}\n\nResponse:`,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Local LLM error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.response;
  }

  private async executeMCPOperation(
    operation: { type: string; params: Record<string, any> }, 
    projectId?: string
  ): Promise<any> {
    // Add projectId to params if provided and not already present
    if (projectId && !operation.params.projectId) {
      operation.params.projectId = projectId;
    }

    console.log('Executing MCP operation:', {
      type: operation.type,
      params: operation.params,
      projectId
    });

    try {
      const result = await this.mcpClient.callTool(operation.type, operation.params);
      console.log('MCP operation result:', result);
      return result;
    } catch (error) {
      console.error('MCP operation failed:', error);
      throw new Error(`MCP operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}