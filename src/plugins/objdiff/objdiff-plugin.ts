/**
 * Objdiff Plugin
 *
 * Compares compiled object files with target using objdiff-wasm.
 * Determines if the generated code matches the target assembly.
 */
import fs from 'fs/promises';
import type * as ObjdiffWasm from 'objdiff-wasm';
import { fileURLToPath } from 'url';
import { z } from 'zod';

import { PipelineConfig } from '~/shared/config';
import type { PipelineContext, Plugin, PluginReportSection, PluginResult } from '~/shared/types.js';

type ObjdiffModule = typeof ObjdiffWasm;
type ParsedObject = ObjdiffWasm.diff.Object;
type ObjectDiff = ObjdiffWasm.diff.ObjectDiff;
type DiffConfig = ObjdiffWasm.diff.DiffConfig;
type DiffSide = ObjdiffWasm.diff.DiffSide;

/**
 * Configuration schema for ObjdiffPlugin
 *
 * Note: Target object paths are now specified per-prompt in settings.yaml,
 * so this plugin requires no configuration.
 */
export const objdiffConfigSchema = z.object({});

export type ObjdiffConfig = z.infer<typeof objdiffConfigSchema>;

/**
 * Objdiff Plugin result data
 */
export interface ObjdiffResult {
  matchingCount: number;
  differenceCount: number;
  currentAsm: string;
  targetAsm: string;
  differences?: string[];
}

/**
 * Objdiff Plugin
 *
 * Compares compiled object files with target using objdiff-wasm.
 * Target paths are provided per-prompt via the pipeline context.
 */
export class ObjdiffPlugin implements Plugin<ObjdiffResult> {
  static readonly pluginId = 'objdiff';
  static readonly configSchema = objdiffConfigSchema;

  readonly id = ObjdiffPlugin.pluginId;
  readonly name = 'Objdiff';
  readonly description = 'Compares the compiled code with target object file using objdiff';

  #objdiff: Promise<ObjdiffModule>;

  constructor(_config?: ObjdiffConfig, _pipelineConfig?: PipelineConfig) {
    this.#objdiff = this.#initializeObjdiff();
  }

  async #initializeObjdiff(): Promise<ObjdiffModule> {
    // Node.js fetch doesn't support file:// URLs, so we patch it temporarily
    // to load local files when objdiff-wasm requests them during initialization
    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      if (url.includes('objdiff.core.wasm')) {
        const buffer = await fs.readFile(fileURLToPath(url));
        return new Response(buffer, { headers: { 'content-type': 'application/wasm' } });
      }
      return originalFetch(input);
    };

    try {
      const objdiff = await import('objdiff-wasm');
      objdiff.init('error');
      return objdiff;
    } finally {
      global.fetch = originalFetch;
    }
  }

  async #getDiffConfig(): Promise<DiffConfig> {
    const objdiff = await this.#objdiff;
    const diffConfig = new objdiff.diff.DiffConfig();

    diffConfig.setProperty('functionRelocDiffs', 'none');
    diffConfig.setProperty('arm.archVersion', 'v4t');

    return diffConfig;
  }

  async #parseObjectFile(filePath: string, side: DiffSide = 'base'): Promise<ParsedObject> {
    const objdiff = await this.#objdiff;
    const diffConfig = await this.#getDiffConfig();

    const fileBuffer = await fs.readFile(filePath);
    const parsedObject = objdiff.diff.Object.parse(new Uint8Array(fileBuffer), diffConfig, side);

    return parsedObject;
  }

  async #runDiff(left: ObjdiffWasm.diff.Object, right?: ObjdiffWasm.diff.Object) {
    const objdiff = await this.#objdiff;
    const diffConfig = await this.#getDiffConfig();

    const mappingConfig = {
      mappings: [],
      selectingLeft: undefined,
      selectingRight: undefined,
    };

    return objdiff.diff.runDiff(left, right, diffConfig, mappingConfig);
  }

  async #getSymbolsName(obj: ParsedObject): Promise<string[]> {
    const objdiff = await this.#objdiff;
    const diffResult = await this.#runDiff(obj);

    if (!diffResult.left) {
      return [];
    }

    const sections = objdiff.display.displaySections(
      diffResult.left,
      {},
      {
        showHiddenSymbols: false,
        showMappedSymbols: false,
        reverseFnOrder: false,
      },
    );

    const symbolNames: string[] = [];
    for (const section of sections) {
      for (const symbolRef of section.symbols) {
        const symbol = objdiff.display.displaySymbol(diffResult.left, symbolRef);
        symbolNames.push(symbol.info.name);
      }
    }

    return symbolNames;
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<ObjdiffResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();

    if (!context.compiledObjectPath) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No compiled object file to compare',
        },
        context,
      };
    }

    if (!context.targetObjectPath) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No target object file specified',
        },
        context,
      };
    }

    if (!context.functionName) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No function name specified',
        },
        context,
      };
    }

    try {
      const diffConfig = await this.#getDiffConfig();

      const [currentObject, targetObject] = await Promise.all([
        this.#parseObjectFile(context.compiledObjectPath, 'base'),
        this.#parseObjectFile(context.targetObjectPath, 'target'),
      ]);

      const diffResult = await this.#runDiff(currentObject, targetObject);

      if (!diffResult.left) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Failed to parse current object file',
          },
          context,
        };
      }

      if (!diffResult.right) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Failed to parse target object file',
          },
          context,
        };
      }

      // Find the function symbol
      const leftSymbol = diffResult.left.findSymbol(context.functionName, undefined);
      const rightSymbol = diffResult.right.findSymbol(context.functionName, undefined);

      if (!leftSymbol || !rightSymbol) {
        const currentSymbols = await this.#getSymbolsName(currentObject);

        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Symbol not found',
            output: `Symbol \`${context.functionName}\` not found.\n\nAvailable symbols in current object: ${currentSymbols.join(', ')}.\n\nDid you named your function as \`${context.functionName}\`?`,
          },
          context,
        };
      }

      // Get detailed differences
      const { matchingCount, differenceCount, differences } = await this.#getDifferencesFromObjectFiles(
        diffResult.left,
        diffResult.right,
        context.functionName,
        diffConfig,
      );

      // Get assembly for both sides
      const [currentAsm, targetAsm] = await Promise.all([
        this.#getAssemblyFromSymbol(diffResult.left, context.functionName, diffConfig),
        this.#getAssemblyFromSymbol(diffResult.right, context.functionName, diffConfig),
      ]);

      const isMatch = differenceCount === 0;

      let output = `## Current Assembly\n\`\`\`asm\n${currentAsm}\n\`\`\`\n\n`;
      output += `## Target Assembly\n\`\`\`asm\n${targetAsm}\n\`\`\`\n\n`;
      output += `## Summary\n- Matching: ${matchingCount}\n- Different: ${differenceCount}\n\n`;

      if (differences.length > 0) {
        output += `## Differences\n${differences.join('\n')}`;
      }

      if (isMatch) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'success',
            durationMs: Date.now() - startTime,
            output: `Perfect match! ${matchingCount} instructions match.`,
            data: {
              matchingCount,
              differenceCount,
              currentAsm,
              targetAsm,
            },
          },
          context,
        };
      } else {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: `Assembly mismatch: ${differenceCount} differences found`,
            output,
            data: {
              matchingCount,
              differenceCount,
              currentAsm,
              targetAsm,
              differences,
            },
          },
          context,
        };
      }
    } catch (error) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        },
        context,
      };
    }
  }

  getReportSections(result: PluginResult<ObjdiffResult>, _context: PipelineContext): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    // Show current assembly
    if (result.data?.currentAsm) {
      sections.push({
        type: 'code',
        title: 'Current Assembly',
        language: 'text',
        code: result.data.currentAsm as string,
      });
    }

    // Show target assembly
    if (result.data?.targetAsm) {
      sections.push({
        type: 'code',
        title: 'Target Assembly',
        language: 'text',
        code: result.data.targetAsm as string,
      });
    }

    // Show differences if any
    if (result.data?.differences && Array.isArray(result.data.differences) && result.data.differences.length > 0) {
      sections.push({
        type: 'code',
        title: 'Differences',
        language: 'diff',
        code: (result.data.differences as string[]).join('\n'),
      });
    }

    // Show summary
    if (result.data?.matchingCount !== undefined || result.data?.differenceCount !== undefined) {
      sections.push({
        type: 'message',
        title: 'Summary',
        message: `Matching: ${result.data.matchingCount ?? 0}, Different: ${result.data.differenceCount ?? 0}`,
      });
    }

    return sections;
  }

  async #getDifferencesFromObjectFiles(
    diffResultLeft: ObjectDiff,
    diffResultRight: ObjectDiff,
    functionName: string,
    diffConfig: DiffConfig,
  ): Promise<{
    differenceCount: number;
    matchingCount: number;
    differences: string[];
  }> {
    let differenceCount = 0;
    let matchingCount = 0;
    const differences: string[] = [];

    for await (const [leftInstructionRow, rightInstructionRow] of this.#iterateSymbolRows(
      [diffResultLeft, diffResultRight],
      functionName,
      diffConfig,
    )) {
      let leftInstruction = '';
      let rightInstruction = '';
      let leftDiffKind = 'none';
      let rightDiffKind = 'none';

      if (leftInstructionRow) {
        leftDiffKind = leftInstructionRow.diffKind;
        leftInstruction = this.#instructionDiffRowToString(leftInstructionRow);
      }

      if (rightInstructionRow) {
        rightDiffKind = rightInstructionRow.diffKind;
        rightInstruction = this.#instructionDiffRowToString(rightInstructionRow);
      }

      const hasRealDifference = (leftDiffKind !== 'none' || rightDiffKind !== 'none') && leftDiffKind !== rightDiffKind;

      const leftClean = leftInstruction.replace(/\s+/g, ' ').trim();
      const rightClean = rightInstruction.replace(/\s+/g, ' ').trim();
      const contentDiffers = leftClean !== rightClean && leftClean !== '' && rightClean !== '';

      if (hasRealDifference || (contentDiffers && (leftDiffKind !== 'none' || rightDiffKind !== 'none'))) {
        differenceCount++;

        let diffType = '';
        if (leftDiffKind === 'insert' || rightDiffKind === 'insert') {
          diffType = 'INSERTION';
        } else if (leftDiffKind === 'delete' || rightDiffKind === 'delete') {
          diffType = 'DELETION';
        } else if (leftDiffKind === 'replace' || rightDiffKind === 'replace') {
          diffType = 'REPLACEMENT';
        } else if (leftDiffKind === 'op-mismatch' || rightDiffKind === 'op-mismatch') {
          diffType = 'OPCODE_MISMATCH';
        } else if (leftDiffKind === 'arg-mismatch' || rightDiffKind === 'arg-mismatch') {
          diffType = 'ARGUMENT_MISMATCH';
        } else {
          diffType = 'INSTRUCTION_DIFFERENCE';
        }

        differences.push(`Difference ${differenceCount} (${diffType}):`);
        differences.push(`- Current: \`${leftInstruction.trim() || '(empty)'}\` [${leftDiffKind}]`);
        differences.push(`- Target:  \`${rightInstruction.trim() || '(empty)'}\` [${rightDiffKind}]`);
        differences.push('');
      } else if (leftInstruction.trim() !== '' || rightInstruction.trim() !== '') {
        matchingCount++;
      }
    }

    return { differenceCount, matchingCount, differences };
  }

  async *#iterateSymbolRows(objDiffs: ObjectDiff[], symbolName: string, diffConfig: DiffConfig) {
    const objdiff = await this.#objdiff;

    const symbols = objDiffs.map((objDiff) => objDiff.findSymbol(symbolName, undefined)!);
    const displaySymbols = objDiffs.map((objDiff, index) => objdiff.display.displaySymbol(objDiff, symbols[index].id));
    const instructionsCount = Math.max(...displaySymbols.map((displaySymbol) => displaySymbol.rowCount));

    for (let row = 0; row < instructionsCount; row++) {
      try {
        const instructionsRow = objDiffs.map((objDiff, index) =>
          objdiff.display.displayInstructionRow(objDiff, symbols[index].id, row, diffConfig),
        );
        yield instructionsRow;
      } catch (error) {
        console.warn(`Error processing row ${row} for symbol "${symbolName}":`, error);
      }
    }
  }

  async #getAssemblyFromSymbol(objDiff: ObjectDiff, symbolName: string, diffConfig: DiffConfig): Promise<string> {
    const instructions: string[] = [];
    for await (const [instructionRow] of this.#iterateSymbolRows([objDiff], symbolName, diffConfig)) {
      const lineText = this.#instructionDiffRowToString(instructionRow);
      if (lineText.trim()) {
        instructions.push(lineText);
      }
    }

    return instructions.join('\n');
  }

  #instructionDiffRowToString(instructionRow: ObjdiffWasm.display.InstructionDiffRow): string {
    let lineText = '';
    let address = '';

    for (const segment of instructionRow.segments) {
      const text = segment.text;

      switch (text.tag) {
        case 'basic':
          if (text.val === ' ~>') {
            // do nothing
          } else if (text.val === ' (->') {
            lineText += ` # REFERENCE_`;
          } else if (text.val === ' ~> ') {
            lineText += `.L${address}:\n`;
          } else if (text.val === ')' && lineText.includes(' # REFERENCE_')) {
            // do nothing
          } else {
            lineText += text.val;
          }
          break;

        case 'line':
          lineText += text.val.toString(10);
          break;

        case 'address':
          lineText += text.val.toString(16) + ':';
          address = text.val.toString(16);
          break;

        case 'opcode':
          lineText += `${text.val.mnemonic} `;
          break;

        case 'signed':
          if (text.val < 0) {
            lineText += `-0x${(-text.val).toString(16)}`;
          } else {
            lineText += `0x${text.val.toString(16)}`;
          }
          break;

        case 'unsigned':
          lineText += `0x${text.val.toString(16)}`;
          break;

        case 'opaque':
          lineText += text.val;
          break;

        case 'branch-dest':
          lineText += `.L${text.val.toString(16)}`;
          break;

        case 'symbol':
          lineText += text.val.demangledName || text.val.name;
          break;

        case 'addend':
          if (text.val < 0) {
            lineText += `-0x${(-text.val).toString(16)}`;
          } else {
            lineText += `+0x${text.val.toString(16)}`;
          }
          break;

        case 'spacing':
          lineText += ' '.repeat(text.val);
          break;

        case 'eol':
          break;

        default:
          lineText += (text as any)?.val || '';
          break;
      }

      if (segment.padTo > lineText.length) {
        const segmentText = lineText.slice(lineText.lastIndexOf('\n') + 1);
        if (segment.padTo > segmentText.length) {
          lineText += ' '.repeat(segment.padTo - segmentText.length);
        }
      }
    }

    return lineText;
  }
}
