/**
 * Assembly utility functions for parsing assembly files.
 */
import { type PlatformTarget, isArmPlatform, isMipsPlatform } from '~/shared/config';

/**
 * Extract function calls from assembly code.
 */
export function extractFunctionCallsFromAssembly(platform: PlatformTarget, assembly: string): string[] {
  if (isArmPlatform(platform)) {
    return armExtractFunctionCalls(assembly);
  }

  if (isMipsPlatform(platform)) {
    return mipsExtractFunctionCalls(assembly);
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

function armExtractFunctionCalls(assembly: string): string[] {
  const functionCalls = new Set<string>();
  const lines = assembly.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // bl (branch with link) instructions
    const blMatch = trimmed.match(/bl\s+(\w+)/);
    if (blMatch) {
      functionCalls.add(blMatch[1]);
    }

    // Function references in @ comments (e.g. "@ =functionName")
    const refMatch = trimmed.match(/@\s*=(\w+)/);
    if (refMatch) {
      functionCalls.add(refMatch[1]);
    }

    // Direct function references in load/add/mov instructions
    const directMatch = trimmed.match(/(?:ldr|add|mov).*=(\w+)/);
    if (directMatch) {
      functionCalls.add(directMatch[1]);
    }
  }

  return Array.from(functionCalls);
}

function mipsExtractFunctionCalls(assembly: string): string[] {
  const functionCalls = new Set<string>();
  const lines = assembly.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (line.startsWith('glabel') || line.startsWith('endlabel')) {
      continue;
    }

    // jal (jump and link) instructions
    const jalMatch = trimmed.match(/jal\s+(\w+)/);
    if (jalMatch) {
      functionCalls.add(jalMatch[1]);
    }

    // Function references in ; comments (e.g. "; =functionName")
    const refMatch = trimmed.match(/;\s*=(\w+)/);
    if (refMatch) {
      functionCalls.add(refMatch[1]);
    }

    // Direct function references in load instructions
    const directMatch = trimmed.match(/(?:la|lw|lui).*\b(\w+)(?:\s*\+|$)/);
    if (directMatch) {
      const functionName = directMatch[1];
      if (!functionName.match(/^\$\w+$/) && !functionName.match(/^0x[0-9a-fA-F]+$/)) {
        functionCalls.add(functionName);
      }
    }
  }

  return Array.from(functionCalls);
}

/**
 * List all functions from an assembly module source.
 */
export function listFunctionsFromAsmModule(
  platform: PlatformTarget,
  assemblyContent: string,
): Array<{ name: string; code: string }> {
  if (isArmPlatform(platform)) {
    return armListFunctionsFromAsmModule(assemblyContent);
  }

  if (isMipsPlatform(platform)) {
    return mipsListFunctionsFromAsmModule(assemblyContent);
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

function armListFunctionsFromAsmModule(assemblyContent: string): Array<{ name: string; code: string }> {
  const functions: Array<{ name: string; code: string }> = [];
  const lines = assemblyContent.split('\n');

  let currentFunction: { name: string; startIndex: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const thumbStartMatch = line.match(/thumb_func_start\s+(\w+)/);
    const armStartMatch = line.match(/arm_func_start\s+(\w+)/);

    if (thumbStartMatch || armStartMatch) {
      if (currentFunction) {
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({ name: currentFunction.name, code: functionCode });
      }

      const functionName = thumbStartMatch ? thumbStartMatch[1] : armStartMatch![1];
      currentFunction = { name: functionName, startIndex: i };
    } else if (!currentFunction) {
      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):(\s*@.*)?$/);
      if (labelMatch) {
        const functionName = labelMatch[1];
        if (
          !functionName.startsWith('_08') &&
          !functionName.startsWith('.') &&
          functionName !== 'gUnknown' &&
          !functionName.includes('Unknown')
        ) {
          currentFunction = { name: functionName, startIndex: i };
        }
      }
    } else if (currentFunction) {
      const thumbEndMatch = line.match(/thumb_func_end\s+(\w+)/);
      const armEndMatch = line.match(/arm_func_end\s+(\w+)/);

      if (
        (thumbEndMatch && thumbEndMatch[1] === currentFunction.name) ||
        (armEndMatch && armEndMatch[1] === currentFunction.name)
      ) {
        const functionCode = lines.slice(currentFunction.startIndex, i + 1).join('\n');
        functions.push({ name: currentFunction.name, code: functionCode });
        currentFunction = null;
      } else if (line.includes('thumb_func_start') || line.includes('arm_func_start')) {
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({ name: currentFunction.name, code: functionCode });

        const newThumbMatch = line.match(/thumb_func_start\s+(\w+)/);
        const newArmMatch = line.match(/arm_func_start\s+(\w+)/);
        const functionName = newThumbMatch ? newThumbMatch[1] : newArmMatch![1];
        currentFunction = { name: functionName, startIndex: i };
      } else if (line.endsWith(':') && !line.startsWith('.') && !line.startsWith('_08')) {
        const labelName = line.substring(0, line.length - 1);
        if (
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(labelName) &&
          labelName !== currentFunction.name &&
          !labelName.includes('Unknown')
        ) {
          const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
          functions.push({ name: currentFunction.name, code: functionCode });
          currentFunction = { name: labelName, startIndex: i };
        }
      }
    }
  }

  if (currentFunction) {
    const functionCode = lines.slice(currentFunction.startIndex).join('\n');
    functions.push({ name: currentFunction.name, code: functionCode });
  }

  return functions;
}

function mipsListFunctionsFromAsmModule(assemblyContent: string): Array<{ name: string; code: string }> {
  const functions: Array<{ name: string; code: string }> = [];
  const lines = assemblyContent.split('\n');

  let currentFunction: { name: string; startIndex: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const glabelMatch = line.match(/glabel\s+(\w+)/);

    if (glabelMatch) {
      if (currentFunction) {
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({ name: currentFunction.name, code: functionCode });
      }

      const functionName = glabelMatch[1];
      currentFunction = { name: functionName, startIndex: i };
    } else if (!currentFunction) {
      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):(\s*@.*)?$/);
      if (labelMatch) {
        const functionName = labelMatch[1];
        if (
          !functionName.startsWith('_') &&
          !functionName.startsWith('.') &&
          functionName !== 'gUnknown' &&
          !functionName.includes('Unknown')
        ) {
          currentFunction = { name: functionName, startIndex: i };
        }
      }
    } else if (currentFunction) {
      const sizeMatch = line.match(/\.size\s+(\w+)/);

      if (sizeMatch && sizeMatch[1] === currentFunction.name) {
        const functionCode = lines.slice(currentFunction.startIndex, i + 1).join('\n');
        functions.push({ name: currentFunction.name, code: functionCode });
        currentFunction = null;
      } else if (line.includes('glabel')) {
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({ name: currentFunction.name, code: functionCode });

        const newGlabelMatch = line.match(/glabel\s+(\w+)/);
        const functionName = newGlabelMatch![1];
        currentFunction = { name: functionName, startIndex: i };
      } else if (line.endsWith(':') && !line.startsWith('.')) {
        const labelName = line.substring(0, line.length - 1);
        if (
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(labelName) &&
          labelName !== currentFunction.name &&
          !labelName.includes('Unknown') &&
          !labelName.startsWith('_')
        ) {
          const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
          functions.push({ name: currentFunction.name, code: functionCode });
          currentFunction = { name: labelName, startIndex: i };
        }
      }
    }
  }

  if (currentFunction) {
    const functionCode = lines.slice(currentFunction.startIndex).join('\n');
    functions.push({ name: currentFunction.name, code: functionCode });
  }

  return functions;
}

/**
 * Extract only the body instructions from assembly function code,
 * stripping headers, footers, and metadata.
 */
export function extractAsmFunctionBody(platform: PlatformTarget, asmCode: string): string {
  if (isArmPlatform(platform)) {
    return armExtractFunctionBody(asmCode);
  }

  if (isMipsPlatform(platform)) {
    return mipsExtractFunctionBody(asmCode);
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

function armExtractFunctionBody(asmCode: string): string {
  const lines = asmCode.split('\n');
  const bodyLines: string[] = [];
  let sawFunctionStart = false;
  let skippedFunctionLabel = false;
  let hasInstructions = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      continue;
    }

    if (trimmed.includes('thumb_func_start') || trimmed.includes('arm_func_start')) {
      sawFunctionStart = true;
      continue;
    }
    if (trimmed.includes('thumb_func_end') || trimmed.includes('arm_func_end')) {
      break;
    }

    // Skip the main function name label that appears right after func_start
    if (sawFunctionStart && !skippedFunctionLabel) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const labelName = trimmed.substring(0, colonIndex);
        if (!labelName.startsWith('_') && !labelName.startsWith('.')) {
          skippedFunctionLabel = true;
          continue;
        }
      }
    }

    if (trimmed.startsWith('.align')) {
      continue;
    }

    const isLabel = trimmed.includes(':');
    const isConstantDef = isLabel && trimmed.includes('.4byte');
    if (!isLabel || isConstantDef) {
      if (!isConstantDef) {
        hasInstructions = true;
      }
    } else if (isLabel && !isConstantDef) {
      hasInstructions = true;
    }

    bodyLines.push(trimmed);
  }

  return hasInstructions ? bodyLines.join('\n') : '';
}

function mipsExtractFunctionBody(asmCode: string): string {
  const lines = asmCode.split('\n');
  const bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      continue;
    }

    if (trimmed.startsWith('glabel') || trimmed.startsWith('endlabel')) {
      continue;
    }

    if (trimmed.startsWith('.size')) {
      continue;
    }

    let processedLine = trimmed;

    const mipsCommentIndex = processedLine.indexOf(';');
    if (mipsCommentIndex !== -1) {
      processedLine = processedLine.substring(0, mipsCommentIndex).trim();
    }

    processedLine = processedLine.replace(/\s+/g, ' ').trim();

    if (processedLine) {
      bodyLines.push(processedLine);
    }
  }

  return bodyLines.join('\n');
}

/**
 * Strip all comment types from assembly code.
 */
export function stripCommentaries(asmCode: string): string {
  const lines = asmCode.split('\n');
  const strippedLines: string[] = [];

  for (const line of lines) {
    let strippedLine = line;

    // C-style block comments (/* ... */)
    let blockCommentStart = strippedLine.indexOf('/*');
    while (blockCommentStart !== -1) {
      const blockCommentEnd = strippedLine.indexOf('*/', blockCommentStart + 2);
      if (blockCommentEnd !== -1) {
        strippedLine = strippedLine.substring(0, blockCommentStart) + strippedLine.substring(blockCommentEnd + 2);
        blockCommentStart = strippedLine.indexOf('/*');
      } else {
        strippedLine = strippedLine.substring(0, blockCommentStart);
        break;
      }
    }

    // ARM-style comments (start with @)
    const armCommentIndex = strippedLine.indexOf('@');
    if (armCommentIndex !== -1) {
      strippedLine = strippedLine.substring(0, armCommentIndex);
    }

    // MIPS-style comments (start with ;) - only if no ARM comment was found
    if (armCommentIndex === -1) {
      const mipsCommentIndex = strippedLine.indexOf(';');
      if (mipsCommentIndex !== -1) {
        strippedLine = strippedLine.substring(0, mipsCommentIndex);
      }
    }

    // C-style line comments (start with //) - only if no ARM comment was found
    if (armCommentIndex === -1) {
      const cStyleCommentIndex = strippedLine.indexOf('//');
      if (cStyleCommentIndex !== -1) {
        strippedLine = strippedLine.substring(0, cStyleCommentIndex);
      }
    }

    strippedLine = strippedLine.trimEnd();
    strippedLines.push(strippedLine);
  }

  return strippedLines.join('\n');
}

/**
 * Count the number of non-empty body lines in an assembly function.
 */
export function countBodyLinesFromAsmFunction(platform: PlatformTarget, asmCode: string): number {
  const bodyCode = extractAsmFunctionBody(platform, asmCode);
  const bodyLines = bodyCode.split('\n').filter((line) => line.trim() !== '');
  return bodyLines.length;
}
