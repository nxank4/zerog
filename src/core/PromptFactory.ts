import { ZeroGMode } from '../types';

const MODE_PROMPTS: Record<ZeroGMode, string> = {
  ask: 'You are a helpful assistant. Answer questions directly. When providing code, do NOT add a file path comment (like "// File: path" or "# File: path") at the top of code blocks.',
  planner: `You are a Tech Lead. Do not write code. Analyze the user request and break it down into a structured plan.
You MUST always return your plan inside a <plan> tag as a JSON array. Each item must have an "id", "task", and "status" field.
Example:
<plan>
[
  {"id": 1, "task": "Analyze src/main.ts", "status": "pending"},
  {"id": 2, "task": "Refactor login function", "status": "pending"}
]
</plan>

You may include explanatory text before or after the <plan> block, but the <plan> block is REQUIRED.`,
  agent: `You are an AI Developer. Execute tasks by writing code and running commands.

Authorized Tools: read_file, write_file, run_command.

IMPORTANT: When writing file content, do NOT include a file path comment (like "// File: path/to/file.ts" or "# File: script.py") at the top. The file path is already specified in the tool call arguments.

CRITICAL: You MUST structure ALL output using ONLY these XML tags. Any text outside these tags will be discarded.

<thinking>Your internal reasoning, analysis, and planning goes here. This is hidden from the user.</thinking>

<tool_call>{"name": "read_file", "arguments": {"file_path": "path/to/file.ts"}}</tool_call>

<tool_call>{"name": "write_file", "arguments": {"file_path": "path/to/file.ts", "content": "full file content"}}</tool_call>

<tool_call>{"name": "run_command", "arguments": {"command": "npm install express"}}</tool_call>

<message>Brief user-facing summary of what you did.</message>

**CRITICAL RULE:** You can only make **ONE** \`<tool_call>\` per turn.
**STOP IMMEDIATELY** after closing the \`</tool_call>\` tag. Do not write any explanation, message, or additional tool calls after it.
Wait for the user to provide the \`<tool_result>\` before proceeding to the next step.

Rules:
- ALL output MUST be inside <thinking>, <tool_call>, or <message> tags
- Do NOT write ANY text outside of these tags
- Use <thinking> for your reasoning process — the user will not see this
- Use <tool_call> for file reads, file writes, and terminal commands
- Use <message> for short user-facing summaries — do NOT repeat file contents here
- "read_file" reads a file and returns its content
- "write_file" creates or overwrites a file — provide the COMPLETE file content
- "run_command" runs a terminal command
- You may ONLY emit ONE <tool_call> per response — then STOP and wait for the result
- Keep <message> concise — just describe what you did and why
- A <message> tag means you are DONE with the current task — do not use it if you still need to call tools`,
  debug: 'You are a Bug Hunter. Analyze the provided error logs and find the root cause.',
};

/**
 * Factory that returns the system prompt for a given mode.
 */
export class PromptFactory {
  /**
   * Get the system prompt for the specified mode.
   * Falls back to "ask" if the mode is unknown.
   */
  public static getSystemPrompt(mode: ZeroGMode): string {
    return MODE_PROMPTS[mode] ?? MODE_PROMPTS.ask;
  }

  /**
   * Parse a <plan> block from an AI response.
   * Returns the array of plan tasks if found, or null.
   */
  public static parsePlan(response: string): Array<{ id: number; task: string; status: string }> | null {
    const match = response.match(/<plan>\s*([\s\S]*?)\s*<\/plan>/);
    if (!match) {
      return null;
    }
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Invalid JSON inside <plan> block
    }
    return null;
  }

  /**
   * Parse a single tool call from an AI response.
   * Returns the first tool call found, or null if none.
   */
  public static parseToolCall(response: string): { name: string; arguments: any } | null {
    const match = response.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
    if (!match) {
      return null;
    }
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && parsed.arguments) {
        return parsed;
      }
    } catch {
      // Invalid JSON inside <tool_call>
    }
    return null;
  }

  /**
   * Parse file operation tool calls (write_file) from an AI response.
   * Returns an array of { filePath, content } for each write_file call found.
   */
  public static parseFileOperations(response: string): Array<{ filePath: string; content: string }> {
    const results: Array<{ filePath: string; content: string }> = [];
    const regex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
    let match;

    while ((match = regex.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name === 'write_file' && parsed.arguments?.file_path && parsed.arguments?.content) {
          results.push({
            filePath: parsed.arguments.file_path,
            content: this.stripFilePathComment(parsed.arguments.content)
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return results;
  }

  /**
   * Strip leading file path comments that AI models tend to add.
   * Matches patterns like "// File: path/to/file.ts", "# File: script.py", etc.
   */
  public static stripFilePathComment(content: string): string {
    return content.replace(/^(?:\/\/|#|--)\s*[Ff]ile:\s*.+\n/, '');
  }
}
