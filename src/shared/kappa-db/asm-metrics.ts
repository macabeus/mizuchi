export type PlatformTarget = 'arm' | 'mips';

export type ArmEncoding = 'thumb' | 'arm32';

export interface AsmMetrics {
  instructionCount: number;
  branchCount: number;
  labelCount: number;
  armEncoding?: ArmEncoding;
}

// --- ARM/Thumb assembly counting ---

const ARM_DIRECTIVE_RE = /^\./;
const ARM_THUMB_FUNC_RE = /thumb_func_start/;
const ARM_ARM_FUNC_RE = /arm_func_start/;
const ARM_LABEL_FORMAT_A_RE = /^\.L\w+:$/;
const ARM_LABEL_FORMAT_B_RE = /^_[0-9A-Fa-f]+:/;
const ARM_FUNC_ENTRY_LABEL_RE = /^[\w]+:\s*@\s*0x/;
const ARM_BRANCH_MNEMONICS = new Set([
  'beq',
  'bne',
  'bgt',
  'bge',
  'blt',
  'ble',
  'bhi',
  'bhs',
  'blo',
  'bls',
  'bcc',
  'bcs',
  'bmi',
  'bpl',
]);
const ARM_COMMENT_RE = /\s*@.*$/;
// Instructions that only exist in ARM32 mode, never in Thumb
const ARM32_ONLY_MNEMONICS = new Set([
  'msr',
  'mrs',
  'mcr',
  'mrc',
  'stmfd',
  'ldmfd',
  'stmia',
  'ldmia',
  'stmdb',
  'ldmdb',
]);

function countArmMetrics(asmCode: string): AsmMetrics {
  let instructionCount = 0;
  let branchCount = 0;
  let labelCount = 0;
  let hasArm32OnlyInstr = false;
  const markerEncoding: ArmEncoding | undefined = ARM_THUMB_FUNC_RE.test(asmCode)
    ? 'thumb'
    : ARM_ARM_FUNC_RE.test(asmCode)
      ? 'arm32'
      : undefined;

  const lines = asmCode.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(ARM_COMMENT_RE, '');
    if (line === '') {
      continue;
    }

    // Skip directives (.align, .4byte, .word, .hword, etc.) and func_start markers
    if (ARM_DIRECTIVE_RE.test(line) && !ARM_LABEL_FORMAT_A_RE.test(line)) {
      continue;
    }
    if (ARM_THUMB_FUNC_RE.test(line) || ARM_ARM_FUNC_RE.test(line)) {
      continue;
    }

    // Check for labels
    if (ARM_LABEL_FORMAT_A_RE.test(line) || ARM_LABEL_FORMAT_B_RE.test(line)) {
      labelCount++;
      continue;
    }

    // Skip function entry labels (FuncName: @ 0xADDRESS — already stripped comment, so check original)
    if (ARM_FUNC_ENTRY_LABEL_RE.test(rawLine.trim())) {
      continue;
    }

    // Extract mnemonic (first word)
    const mnemonic = line.split(/\s/)[0].toLowerCase();

    // bl (function call) — count as instruction, not a branch
    if (mnemonic === 'bl') {
      instructionCount++;
      continue;
    }

    // Skip bx (return), bic/bics (bit-clear) — not branches
    if (mnemonic === 'bx' || mnemonic === 'bic' || mnemonic === 'bics') {
      instructionCount++;
      continue;
    }

    // Branches: check if mnemonic is a branch instruction
    if (ARM_BRANCH_MNEMONICS.has(mnemonic)) {
      branchCount++;
      instructionCount++;
      continue;
    }

    // Plain 'b' with a target (not 'bl', 'bx', 'bic')
    if (mnemonic === 'b') {
      branchCount++;
      instructionCount++;
      continue;
    }

    // Track ARM32-only instructions for fallback encoding detection
    if (ARM32_ONLY_MNEMONICS.has(mnemonic)) {
      hasArm32OnlyInstr = true;
    }

    // Everything else is an instruction
    instructionCount++;
  }

  // Encoding: explicit marker > ARM32-only instruction detection > undefined
  const armEncoding = markerEncoding ?? (hasArm32OnlyInstr ? 'arm32' : undefined);
  return { instructionCount, branchCount, labelCount, armEncoding };
}

// --- MIPS assembly counting ---

const MIPS_INSTRUCTION_RE = /\/\*\s*[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s*\*\//;
const MIPS_BRANCH_RE = /\b(beq|bne|bnez|beqz|blez|bgtz|bltz|bgez|blt|bgt|ble|bge|bltzal|bgezal)\b/;
const MIPS_LABEL_RE = /^\s*\.L[\w]+:/;

function countMipsMetrics(asmCode: string): AsmMetrics {
  let instructionCount = 0;
  let branchCount = 0;
  let labelCount = 0;

  const lines = asmCode.split('\n');
  for (const line of lines) {
    if (MIPS_LABEL_RE.test(line)) {
      labelCount++;
    }

    if (!MIPS_INSTRUCTION_RE.test(line)) {
      continue;
    }

    instructionCount++;

    if (MIPS_BRANCH_RE.test(line)) {
      branchCount++;
    }
  }

  return { instructionCount, branchCount, labelCount };
}

export function countAsmMetrics(asmCode: string, platform: PlatformTarget): AsmMetrics {
  if (platform === 'arm') {
    return countArmMetrics(asmCode);
  }

  return countMipsMetrics(asmCode);
}
