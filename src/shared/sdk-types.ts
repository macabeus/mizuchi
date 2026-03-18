/**
 * Shared Claude Agent SDK types
 *
 * Lightweight interfaces for the SDK's streaming protocol, shared across
 * plugins that consume the Agent SDK (claude-runner, build-fixer, etc.).
 */

/**
 * Query interface from the SDK
 */
export interface SDKQuery {
  [Symbol.asyncIterator](): AsyncIterator<SDKMessage>;
  close(): void;
}

/**
 * Error types that can appear on assistant messages
 */
export type SDKAssistantMessageError =
  | 'authentication_failed'
  | 'billing_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'server_error'
  | 'unknown'
  | 'max_output_tokens';

/**
 * SDK content block types
 */
export interface SDKTextBlock {
  type: 'text';
  text: string;
}

export interface SDKToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface SDKToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export type SDKContentBlock = SDKTextBlock | SDKToolUseBlock | SDKToolResultBlock | { type: string; text?: string };

/**
 * SDK message types from the V2 SDK
 */
export interface SDKMessage {
  type: 'assistant' | 'result' | 'user' | string;
  session_id?: string;
  message?: {
    id?: string;
    content: SDKContentBlock[];
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  subtype?: string;
  errors?: string[];
  error?: SDKAssistantMessageError;
  modelUsage?: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      costUSD: number;
    }
  >;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
}
