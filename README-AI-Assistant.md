# AI Assistant Configuration

The AI Assistant has been successfully integrated into LacyLights! Here's how to configure and use it:

## Quick Setup

1. **Configure your AI provider** in `.env`:
   ```bash
   # For Claude (Anthropic) - Recommended
   LLM_PROVIDER=claude
   ANTHROPIC_API_KEY=sk-ant-api03-your_key_here
   CLAUDE_MODEL=claude-3-sonnet-20240229
   
   # For OpenAI
   LLM_PROVIDER=openai
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4
   
   # For Local LLM (Ollama)
   LLM_PROVIDER=local
   LOCAL_LLM_ENDPOINT=http://localhost:11434/api/generate
   LOCAL_LLM_MODEL=llama2
   ```

2. **Start the backend server**:
   ```bash
   npm run dev
   ```

3. **Start the frontend**:
   ```bash
   cd ../lacylights-fe
   npm run dev
   ```

## How It Works

### Context-Aware Intelligence
The AI assistant automatically understands:
- **Current Project**: Which project you're working in
- **Current Mode**: Whether you're in fixtures, scenes, cues, or overview
- **Available Resources**: All your fixtures, scenes, and cue lists

### Smart Command Processing
The AI can handle:

#### **Information Queries** (no operations needed)
- "How many fixtures do I have?"
- "What fixtures are in my project?"
- "Show me my scenes"
- "What's the current project status?"

#### **Fixture Management**
- "Add 6 Chauvet SlimPAR fixtures"
- "Create 10 RGB fixtures from ETC ColorSource"
- "Show me fixture details for par1"
- "Suggest optimal channel assignments"

#### **Scene Creation**
- "Create a warm wash scene"
- "Make all fixtures blue"
- "Create a romantic evening scene with 60% intensity"
- "Generate a scene for Act 2 Scene 1"

#### **Cue Management**
- "Add a 5-second fade cue"
- "Create a cue sequence for the opening"
- "Optimize cue timing for smoother transitions"
- "Reorder cues 1-5 with better spacing"

### Context-Sensitive Help
The assistant provides different suggestions based on your current mode:
- **Fixtures Mode**: "Add 6 Chauvet SlimPAR fixtures"
- **Scenes Mode**: "Create a warm wash scene"
- **Cues Mode**: "Add a 5-second fade cue"
- **Overview Mode**: "Show project status"

## Example Usage

1. **Navigate to the Fixtures tab**
2. **Ask**: "How many fixtures do I have?"
3. **Response**: "You currently have 16 fixtures in your project. This includes 12 Chauvet DJ SlimPAR Pro RGBA fixtures and 4 ETC ColorSource Spot fixtures."

4. **Ask**: "Add 3 more Chauvet SlimPAR fixtures"
5. **Response**: "I'll add 3 Chauvet SlimPAR fixtures to your project with auto-assigned channels."

## Troubleshooting

### Error: "String cannot represent value"
This was a serialization issue that has been fixed. The AI assistant now properly handles complex MCP responses.

### No AI Response
Check your environment variables:
- Verify your API key is set correctly
- Ensure the LLM_PROVIDER matches your configuration
- Check that the backend server is running

### AI Gives Incorrect Responses
The AI learns from your project context. Make sure:
- You're in the correct project
- The context data is loading properly
- Your command is clear and specific

## Benefits

1. **Natural Language Control**: No need to remember specific commands or UI patterns
2. **Context Awareness**: Understands your current project and mode
3. **Intelligent Suggestions**: Provides relevant examples based on your workflow
4. **Multi-Step Operations**: Can perform complex sequences like "create project with fixtures and scenes"
5. **Flexible Providers**: Works with Claude, GPT, or local LLMs

The AI assistant transforms LacyLights into a conversational lighting control system!