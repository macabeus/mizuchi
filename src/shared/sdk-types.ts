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
 * Refusal details attached to an assistant message that ended with
 * stop_reason "refusal" (BetaMessage.stop_details).
 */
export interface SDKStopDetails {
  type?: string;
  /** Refusal category ('cyber', 'bio', …); open string, may be null/absent */
  category?: string | null;
  /** Human-readable explanation; display only, never parse */
  explanation?: string | null;
}

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
    /** 'refusal' when the model declined to answer this turn */
    stop_reason?: string | null;
    stop_details?: SDKStopDetails | null;
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
  // Fields carried by the refusal-fallback system messages
  // (subtype 'model_refusal_fallback' / 'model_refusal_no_fallback').
  /** Model that produced the refusal (the originally-requested model) */
  original_model?: string;
  /** Model the turn was retried on after a refusal (fallback path only) */
  fallback_model?: string;
  /** Refusal category from the refused API response */
  api_refusal_category?: string | null;
  /** Refusal explanation from the refused API response; display only */
  api_refusal_explanation?: string | null;
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
