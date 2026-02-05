/**
 * Objdiff Wrapper
 *
 * Shared class wrapping objdiff-wasm.
 * Provides functionality to parse object files and extract assembly.
 */
import fs from 'fs/promises';
import type * as ObjdiffWasm from 'objdiff-wasm';
import { fileURLToPath } from 'url';

type ObjdiffModule = typeof ObjdiffWasm;
type ParsedObject = ObjdiffWasm.diff.Object;
type ObjectDiff = ObjdiffWasm.diff.ObjectDiff;
type DiffConfig = ObjdiffWasm.diff.DiffConfig;
type DiffSide = ObjdiffWasm.diff.DiffSide;

/**
 * Singleton instance of Objdiff
 */
let instance: Objdiff | null = null;

/**
 * Wrapper class for objdiff-wasm
 */
export class Objdiff {
  #objdiff: Promise<ObjdiffModule>;

  constructor() {
    this.#objdiff = this.#initializeObjdiff();
  }

  /**
   * Get the singleton instance of Objdiff
   */
  static getInstance(): Objdiff {
    if (!instance) {
      instance = new Objdiff();
    }
    return instance;
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

  /**
   * Get the diff configuration for ARMv4T
   */
  async #getDiffConfig(): Promise<DiffConfig> {
    const objdiff = await this.#objdiff;
    const diffConfig = new objdiff.diff.DiffConfig();

    diffConfig.setProperty('functionRelocDiffs', 'none');
    diffConfig.setProperty('arm.archVersion', 'v4t');

    return diffConfig;
  }

  /**
   * Parse an object file
   */
  async parseObjectFile(filePath: string, side: DiffSide = 'base'): Promise<ParsedObject> {
    const objdiff = await this.#objdiff;
    const diffConfig = await this.#getDiffConfig();

    const fileBuffer = await fs.readFile(filePath);
    const parsedObject = objdiff.diff.Object.parse(new Uint8Array(fileBuffer), diffConfig, side);

    return parsedObject;
  }

  /**
   * Run diff between two object files
   */
  async runDiff(left: ParsedObject, right?: ParsedObject): Promise<{ left?: ObjectDiff; right?: ObjectDiff }> {
    const objdiff = await this.#objdiff;
    const diffConfig = await this.#getDiffConfig();

    const mappingConfig = {
      mappings: [],
      selectingLeft: undefined,
      selectingRight: undefined,
    };

    return objdiff.diff.runDiff(left, right, diffConfig, mappingConfig);
  }

  /**
   * Get all symbol names from a parsed object
   */
  async getSymbolNames(obj: ParsedObject): Promise<string[]> {
    const objdiff = await this.#objdiff;
    const diffResult = await this.runDiff(obj);

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

  /**
   * Get assembly for a specific symbol from an object diff
   */
  async getAssemblyFromSymbol(objDiff: ObjectDiff, symbolName: string): Promise<string> {
    const diffConfig = await this.#getDiffConfig();
    const instructions: string[] = [];

    for await (const [instructionRow] of this.#iterateSymbolRows([objDiff], symbolName, diffConfig)) {
      const lineText = this.#instructionDiffRowToString(instructionRow);
      if (lineText.trim()) {
        instructions.push(lineText);
      }
    }

    return instructions.join('\n');
  }

  /**
   * Get detailed differences between two object diffs for a function
   */
  async getDifferences(
    leftDiff: ObjectDiff,
    rightDiff: ObjectDiff,
    functionName: string,
  ): Promise<{
    differenceCount: number;
    matchingCount: number;
    differences: string[];
  }> {
    const diffConfig = await this.#getDiffConfig();
    let differenceCount = 0;
    let matchingCount = 0;
    const differences: string[] = [];

    for await (const [leftInstructionRow, rightInstructionRow] of this.#iterateSymbolRows(
      [leftDiff, rightDiff],
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

  /**
   * Convert an instruction diff row to a string representation
   */
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
