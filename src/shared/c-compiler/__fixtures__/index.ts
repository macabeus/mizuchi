import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the agbcc compiler binary for the current platform.
 */
export function getAgbccCompilerPath(): string {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin' && arch === 'arm64') {
    return path.join(__dirname, 'arm', 'agbcc', 'agbcc-mac-arm64');
  } else if (platform === 'linux' && arch === 'x64') {
    return path.join(__dirname, 'arm', 'agbcc', 'agbcc-linux-x86');
  }

  throw new Error(`Unsupported platform for agbcc: ${platform}-${arch}`);
}

export const ARM_ASSEMBLER = 'arm-none-eabi-as';

export const ARM_DIFF_SETTINGS: Record<string, string> = {
  'arm.archVersion': 'v4t',
  functionRelocDiffs: 'none',
};

export const DEFAULT_ARM_FLAGS = '-mthumb-interwork -Wimplicit -Wparentheses -Werror -O2 -fhex-asm';

export const ARM_READELF = 'arm-none-eabi-readelf';

// --- MIPS (KMC GCC) fixtures ---

/**
 * Get the path to the KMC GCC compiler directory.
 * Set the KMC_GCC_DIR environment variable to point to the gcc_kmc directory.
 */
export function getMipsCompilerDir(): string {
  const dir = process.env.KMC_GCC_DIR;
  if (!dir) {
    throw new Error('KMC_GCC_DIR environment variable not set. Point it to the gcc_kmc directory.');
  }
  return dir;
}

export function getMipsCompilerPath(): string {
  return path.join(getMipsCompilerDir(), 'gcc');
}

export function getMipsCompilerEnv(): Record<string, string> {
  return { COMPILER_PATH: getMipsCompilerDir() };
}

export const DEFAULT_MIPS_FLAGS =
  '-mabi=32 -mgp32 -mfp32 -mno-abicalls -fno-PIC -G 0 -Wa,-force-n64align -funsigned-char -w -mips3 -EB -O2 -fno-builtin';

export const MIPS_DIFF_SETTINGS: Record<string, string> = {
  functionRelocDiffs: 'none',
};

export const MIPS_READELF = 'mips-linux-gnu-readelf';

/**
 * Check if the KMC GCC MIPS compiler is available on this system.
 * Returns false if KMC_GCC_DIR is not set or the binary can't execute.
 */
export function isMipsCompilerAvailable(): boolean {
  try {
    const gccDir = getMipsCompilerDir();
    const gccPath = path.join(gccDir, 'gcc');
    execSync(`"${gccPath}" -v`, {
      stdio: 'pipe',
      env: { ...process.env, COMPILER_PATH: gccDir },
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}
