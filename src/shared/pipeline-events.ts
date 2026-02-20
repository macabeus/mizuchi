/**
 * Pipeline Event Types
 *
 * Events emitted by the PluginManager during pipeline execution.
 * Used by the UI layer to render progress updates.
 */
import { PipelineConfig } from './config';

/**
 * Plugin information for display
 */
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
}

/**
 * Event emitted when benchmark starts
 */
export interface BenchmarkStartEvent {
  type: 'benchmark-start';
  config: PipelineConfig;
  plugins: PluginInfo[];
  promptCount: number;
}

/**
 * Event emitted when a plugin is registered
 */
export interface PluginRegisteredEvent {
  type: 'plugin-registered';
  plugin: PluginInfo;
}

/**
 * Event emitted when starting to process a prompt
 */
export interface PromptStartEvent {
  type: 'prompt-start';
  promptPath: string;
  functionName: string;
  targetObjectPath: string;
  promptIndex: number;
  totalPrompts: number;
}

/**
 * Event emitted when starting an attempt
 */
export interface AttemptStartEvent {
  type: 'attempt-start';
  attemptNumber: number;
  maxRetries: number;
}

/**
 * Event emitted when a plugin starts executing
 */
export interface PluginExecutionStartEvent {
  type: 'plugin-execution-start';
  pluginId: string;
  pluginName: string;
}

/**
 * Event emitted when a plugin completes execution
 */
export interface PluginExecutionCompleteEvent {
  type: 'plugin-execution-complete';
  pluginId: string;
  pluginName: string;
  status: 'success' | 'failure' | 'skipped';
  error?: string;
  durationMs: number;
}

/**
 * Event emitted when an attempt completes
 */
export interface AttemptCompleteEvent {
  type: 'attempt-complete';
  attemptNumber: number;
  success: boolean;
  willRetry: boolean;
  /** Number of assembly differences from objdiff, if available */
  differenceCount?: number;
}

/**
 * Event emitted when a prompt completes processing
 */
export interface PromptCompleteEvent {
  type: 'prompt-complete';
  promptPath: string;
  functionName: string;
  success: boolean;
  attemptsUsed: number;
  durationMs: number;
}

/**
 * Event emitted when benchmark completes
 */
export interface BenchmarkCompleteEvent {
  type: 'benchmark-complete';
  summary: {
    totalPrompts: number;
    successfulPrompts: number;
    successRate: number;
    avgAttempts: number;
    totalDurationMs: number;
  };
}

/**
 * Event emitted when the setup-flow phase starts
 */
export interface SetupFlowStartEvent {
  type: 'setup-flow-start';
}

/**
 * Event emitted when the programmatic flow phase starts
 */
export interface ProgrammaticFlowStartEvent {
  type: 'programmatic-flow-start';
}

/**
 * Event emitted when a background task starts
 */
export interface BackgroundTaskStartEvent {
  type: 'background-task-start';
  taskId: string;
  triggeredByAttempt: number;
}

/**
 * Event emitted when a background task reports progress
 */
export interface BackgroundTaskProgressEvent {
  type: 'background-task-progress';
  taskId: string;
  currentBestScore: number;
  iterationsRun: number;
}

/**
 * Event emitted when a background task completes
 */
export interface BackgroundTaskCompleteEvent {
  type: 'background-task-complete';
  taskId: string;
  success: boolean;
  durationMs: number;
}

/**
 * Union type of all pipeline events
 */
export type PipelineEvent =
  | BenchmarkStartEvent
  | PluginRegisteredEvent
  | PromptStartEvent
  | SetupFlowStartEvent
  | ProgrammaticFlowStartEvent
  | AttemptStartEvent
  | PluginExecutionStartEvent
  | PluginExecutionCompleteEvent
  | AttemptCompleteEvent
  | PromptCompleteEvent
  | BenchmarkCompleteEvent
  | BackgroundTaskStartEvent
  | BackgroundTaskProgressEvent
  | BackgroundTaskCompleteEvent;

/**
 * Event handler callback type
 */
export type PipelineEventHandler = (event: PipelineEvent) => void;
