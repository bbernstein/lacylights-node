import { Context } from '../../context';
import { AIAssistantService } from '../../services/aiAssistantService';

const aiAssistant = new AIAssistantService();

export const aiAssistantResolvers = {
  Mutation: {
    askAIAssistant: async (
      parent: any,
      args: {
        input: {
          command: string;
          projectId?: string;
          currentMode?: string;
          contextData?: string;
        };
      },
      context: Context
    ) => {
      const { command, projectId, currentMode, contextData } = args.input;
      
      try {
        // Parse context data if provided
        let parsedContext = {};
        if (contextData) {
          try {
            parsedContext = JSON.parse(contextData);
          } catch (error) {
            console.warn('Failed to parse context data:', error);
          }
        }

        // Build application context
        const applicationContext = {
          projectId,
          currentMode: currentMode as 'fixtures' | 'scenes' | 'cues' | 'overview',
          ...parsedContext
        };
        
        const result = await aiAssistant.processCommand(command, applicationContext);
        return result;
      } catch (error) {
        return {
          success: false,
          message: `AI Assistant error: ${error instanceof Error ? error.message : String(error)}`,
          operations: []
        };
      }
    }
  }
};