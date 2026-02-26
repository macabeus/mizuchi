import type { PlatformTarget } from '~/shared/config.js';

import type { SamplingCFunction } from './codebase-context.js';

/**
 * Strip lines that appear after the assembly function body.
 *
 * Kappa-db asm snippets sometimes include trailing section-separator comments
 * (e.g. `@ --- End of Character Select ---`) and blank lines that are not part
 * of the function. This walks backwards from the end and removes any line that
 * is empty or comment-only, stopping at the last real assembly content
 * (instructions, directives, labels, data).
 *
 * Handles comment prefixes for all supported platforms:
 *   ARM  → `@`
 *   MIPS → `#`
 *   General → `//`, `;`
 *
 * TODO: Strip these lines while writing them at KappaDB instead of in the prompt builder
 */
const ASM_COMMENT_ONLY_RE = /^(@|#|\/\/|;)/;

export function stripTrailingAsmLines(asm: string): string {
  const lines = asm.split('\n');

  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1].trim();
    if (line === '' || ASM_COMMENT_ONLY_RE.test(line)) {
      end--;
    } else {
      break;
    }
  }

  return lines.slice(0, end).join('\n');
}

const templateExample = `# Examples

`;

const templateFunctionsCallingTarget = `# Functions that call the target assembly

`;

const templateTargetAssemblyDeclaration = `# Function declaration for the target assembly

\`{targetAssemblyDeclaration}\``;

const templateDeclarationsForFunctionsCalledFromTarget = `# Declarations for the functions called from the target assembly

`;

const templateTypeDefinitions = `# Types definitions used in the declarations

`;

const rules = `# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.`;

const templateDecompile = `You are decompiling an assembly function called \`{assemblyFunctionName}\` in {assemblyLanguage} from a {platformName} game.

{examplePrompts}

{functionsCallingTargetPrompt}

{targetAssemblyDeclarationPrompt}

{functionDeclarationsPrompt}

{typeDefinitionsPrompt}

# Primary Objective

Decompile the following target assembly function from \`{modulePath}\` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

\`\`\`asm
{assemblyCode}
\`\`\`

{rules}
`;

const mappingPlatforms: Record<PlatformTarget, { name: string; assembly: string }> = {
  gba: { name: 'Game Boy Advance', assembly: 'ARMv4T' },
  nds: { name: 'Nintendo DS', assembly: 'ARMv5TE' },
  n3ds: { name: 'Nintendo 3DS', assembly: 'ARMv6K' },
  n64: { name: 'Nintendo 64', assembly: 'MIPS' },
  gc: { name: 'GameCube', assembly: 'PowerPC' },
  wii: { name: 'Wii', assembly: 'PowerPC' },
  ps1: { name: 'PlayStation', assembly: 'MIPS' },
  ps2: { name: 'PlayStation 2', assembly: 'MIPS' },
  psp: { name: 'PlayStation Portable', assembly: 'MIPS' },
  win32: { name: 'Windows (32-bit)', assembly: 'x86' },
  switch: { name: 'Nintendo Switch', assembly: 'AArch64' },
  android_x86: { name: 'Android (x86)', assembly: 'x86' },
  irix: { name: 'IRIX', assembly: 'MIPS' },
  saturn: { name: 'Sega Saturn', assembly: 'SuperH' },
  dreamcast: { name: 'Dreamcast', assembly: 'SuperH' },
};

export function craftPrompt({
  platform,
  modulePath,
  asmName,
  asmDeclaration,
  asmCode,
  calledFunctionsDeclarations,
  sampling,
  typeDefinitions,
}: {
  platform: PlatformTarget;
  modulePath: string;
  asmName: string;
  asmDeclaration?: string;
  asmCode: string;
  calledFunctionsDeclarations: { [functionName: string]: string };
  sampling: SamplingCFunction[];
  typeDefinitions: string[];
}): string {
  // TODO: Instead of slicing, we should use a sampling strategy to select examples
  const examples = sampling.filter((sample) => !sample.callsTarget).slice(0, 5);
  const examplePrompts = examples.length
    ? `${templateExample}${examples
        .map(
          (sample) =>
            `## \`${sample.name}\`\n\n\`\`\`c\n${sample.cCode}\n\`\`\`\n\n\`\`\`asm\n${sample.asmCode}\n\`\`\``,
        )
        .join('\n\n')}`
    : '';

  const cFunctionsCallingTarget = sampling.filter((sample) => sample.callsTarget);
  const functionsCallingTargetPrompt = cFunctionsCallingTarget.length
    ? `${templateFunctionsCallingTarget}${cFunctionsCallingTarget
        .map(
          (sample) =>
            `## \`${sample.name}\`\n\n\`\`\`c\n${sample.cCode}\n\`\`\`\n\n\`\`\`asm\n${sample.asmCode}\n\`\`\``,
        )
        .join('\n\n')}`
    : '';

  const targetAssemblyDeclarationPrompt = asmDeclaration
    ? templateTargetAssemblyDeclaration.replace('{targetAssemblyDeclaration}', asmDeclaration)
    : '';

  const declarationsValues = Object.values(calledFunctionsDeclarations);
  const functionDeclarationsPrompt = declarationsValues.length
    ? `${templateDeclarationsForFunctionsCalledFromTarget}${Object.values(calledFunctionsDeclarations)
        .map((decl) => `- \`${decl}\``)
        .join('\n')}`
    : '';

  const typeDefinitionsPrompt = typeDefinitions.length
    ? `${templateTypeDefinitions}${typeDefinitions.map((typeDef) => `\`\`\`c\n${typeDef}\n\`\`\``).join('\n\n')}`
    : '';

  const platformInfo = mappingPlatforms[platform];

  const finalPrompt = templateDecompile
    .replace('{assemblyLanguage}', platformInfo.assembly)
    .replace('{platformName}', platformInfo.name)
    .replace('{assemblyFunctionName}', asmName)
    .replace('{modulePath}', modulePath)
    .replace('{examplePrompts}', examplePrompts)
    .replace('{functionsCallingTargetPrompt}', functionsCallingTargetPrompt)
    .replace('{targetAssemblyDeclarationPrompt}', targetAssemblyDeclarationPrompt)
    .replace('{functionDeclarationsPrompt}', functionDeclarationsPrompt)
    .replace('{typeDefinitionsPrompt}', typeDefinitionsPrompt)
    .replace('{assemblyCode}', stripTrailingAsmLines(asmCode))
    .replace('{rules}', rules);

  return finalPrompt;
}
