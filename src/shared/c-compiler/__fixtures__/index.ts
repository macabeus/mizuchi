import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ARM (agbcc) fixtures ---

function getAgbccCompilerPath(): string {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin' && arch === 'arm64') {
    return path.join(__dirname, 'arm', 'agbcc', 'agbcc-mac-arm64');
  } else if (platform === 'linux' && arch === 'x64') {
    return path.join(__dirname, 'arm', 'agbcc', 'agbcc-linux-x86');
  }

  throw new Error(`Unsupported platform for agbcc: ${platform}-${arch}`);
}

const ARM_ASSEMBLER = 'arm-none-eabi-as';

export const ARM_DIFF_SETTINGS: Record<string, string> = {
  'arm.archVersion': 'v4t',
  functionRelocDiffs: 'none',
};

const DEFAULT_ARM_FLAGS = '-mthumb-interwork -Wimplicit -Wparentheses -Werror -O2 -fhex-asm';

export function getArmCompilerScript(): string {
  const compilerPath = getAgbccCompilerPath();
  return `"${compilerPath}" "{{cFilePath}}" -o asm.s ${DEFAULT_ARM_FLAGS}\n${ARM_ASSEMBLER} asm.s -o "{{objFilePath}}"`;
}

// --- MIPS (KMC GCC) fixtures ---

function getMipsCompilerDir(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(__dirname, 'mips', 'gcc_kmc', 'mac-x86');
  } else if (platform === 'linux') {
    return path.join(__dirname, 'mips', 'gcc_kmc', 'linux-x86');
  }

  throw new Error(`Unsupported platform for KMC GCC: ${platform}`);
}

const DEFAULT_MIPS_FLAGS =
  '-mabi=32 -mgp32 -mfp32 -mno-abicalls' +
  ' -fno-PIC -G 0 -Wa,-force-n64align' +
  ' -funsigned-char -w -mips3 -EB -O2' +
  ' -fno-builtin';

export function getMipsCompilerScript(): string {
  const compilerDir = getMipsCompilerDir();
  const compilerPath = path.join(compilerDir, 'gcc');
  return `COMPILER_PATH='${compilerDir}' '${compilerPath}' ${DEFAULT_MIPS_FLAGS} -c "{{cFilePath}}" -o "{{objFilePath}}"`;
}
