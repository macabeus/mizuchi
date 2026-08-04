import { z } from 'zod';

/**
 * Schema for per-prompt settings.yaml
 */
export const promptSettingsSchema = z.object({
  functionName: z.string().describe('Name of the function to decompile'),
  targetObjectPath: z.string().describe('Path to the target object file for this prompt'),
  asm: z.string().describe('Assembly for the function'),
  compilerFlags: z
    .string()
    .optional()
    .describe('Extra compiler flags for this function, substituted into {{extraFlags}} in the compiler script'),
});

export type PromptSettings = z.infer<typeof promptSettingsSchema>;
