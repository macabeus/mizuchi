/**
 * CLI Prompt Interface
 *
 * Provides a way for plugins to interact with the user via the CLI.
 * The implementation lives in the UI layer (commands/index.tsx) and uses
 * Ink's useInput hook for keyboard interaction.
 */

export interface CliPromptChoice<T extends string = string> {
  label: string;
  value: T;
}

export interface CliPrompt {
  /**
   * Present a choice question to the user and await their response.
   * The UI implementation handles rendering the prompt and capturing input.
   * The return type is constrained to one of the values from the choices.
   */
  askChoice<T extends string>(message: string, choices: readonly CliPromptChoice<T>[]): Promise<T>;
}
