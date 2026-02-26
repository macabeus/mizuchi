import { z } from 'zod';

/**
 * Schema for per-prompt settings.yaml
 */
export const promptSettingsSchema = z.object({
  functionName: z.string().describe('Name of the function to decompile'),
  targetObjectPath: z.string().describe('Path to the target object file for this prompt'),
  asm: z.string().describe('GAS-formatted assembly for the function'),
});

export type PromptSettings = z.infer<typeof promptSettingsSchema>;
