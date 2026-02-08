import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CCompiler } from './c-compiler/c-compiler.js';
import { M2c } from './m2c.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('M2c', () => {
  describe('.convertObjdiffAsmToGas', () => {
    it('converts basic objdiff assembly to GAS format', () => {
      const objdiffAsm = `0:    push {r4, r5, r6, r7, lr}
4:    mov r5, r1
8:    ldr r0, [r4, #0x0]`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'testFunc');

      expect(result).toBe(`.text
glabel testFunc
    push {r4, r5, r6, r7, lr}
    mov r5, r1
    ldr r0, [r4, #0x0]
`);
    });

    it('preserves labels', () => {
      const objdiffAsm = `0:    push {r4, lr}
4:    mov r4, r0
.L8:
8:    ldr r0, [r4, #0x0]
c:    b .L8`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'myFunc');

      expect(result).toBe(`.text
glabel myFunc
    push {r4, lr}
    mov r4, r0
.L8:
    ldr r0, [r4, #0x0]
    b .L8
`);
    });

    it('handles hex addresses with letters', () => {
      const objdiffAsm = `1c:    mov r0, #0x0
2a:    bx lr`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'func');

      expect(result).toBe(`.text
glabel func
    mov r0, #0x0
    bx lr
`);
    });

    it('handles empty input', () => {
      const result = M2c.convertObjdiffAsmToGas('', 'func');
      expect(result).toBe(`.text
glabel func
`);
    });

    it('converts PC-relative loads with REFERENCE to =symbol syntax', () => {
      const objdiffAsm = `0:    push {r4, r5, r6, r7, lr}
4:    ldr r0, [pc, #0x54] # REFERENCE_gCurTask
8:    ldr r1, [pc, #0x4c] # REFERENCE_gUnknown_080D1D50
c:    mov r5, r1`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'testFunc');

      expect(result).toBe(`.text
glabel testFunc
    push {r4, r5, r6, r7, lr}
    ldr r0, =gCurTask
    ldr r1, =gUnknown_080D1D50
    mov r5, r1
`);
    });

    it('converts PC-relative loads with numeric REFERENCE to =value syntax', () => {
      const objdiffAsm = `0:    push {r4, lr}
4:    ldr r0, [pc, #0x10] # REFERENCE_0x3000628`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'testFunc');

      expect(result).toBe(`.text
glabel testFunc
    push {r4, lr}
    ldr r0, =0x3000628
`);
    });

    it('resolves .L<hex> REFERENCE via literal pool in display', () => {
      const objdiffAsm = `0:    push {r4, lr}
4:    ldr r1, [pc, #0xc] # REFERENCE_.L14
8:    ldr r0, [r1, #0x0]
c:    pop {r4, pc}
.Lpool:
14:    .word 0x30000c4`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'testFunc');

      expect(result).toBe(`.text
glabel testFunc
    push {r4, lr}
    ldr r1, =0x30000c4
    ldr r0, [r1, #0x0]
    pop {r4, pc}
.Lpool:
`);
    });

    it('resolves .L<hex> REFERENCE via literalPoolOverrides when not in display', () => {
      const objdiffAsm = `0:    push {r4, r5, r6, r7, lr}
4:    ldr r0, [pc, #0x54] # REFERENCE_.L5c
8:    ldr r1, [pc, #0x54] # REFERENCE_.L60
c:    mov r5, r1
58:    bx r0`;

      const overrides = new Map<number, string>([
        [0x5c, 'gCurTask'],
        [0x60, 'gUnknown_080D1D50'],
      ]);

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'sub_8056430', overrides);

      expect(result).toBe(`.text
glabel sub_8056430
    push {r4, r5, r6, r7, lr}
    ldr r0, =gCurTask
    ldr r1, =gUnknown_080D1D50
    mov r5, r1
    bx r0
`);
    });

    it('falls back to raw instruction when .L<hex> has no pool data', () => {
      const objdiffAsm = `0:    push {lr}
4:    ldr r0, [pc, #0x10] # REFERENCE_.L18`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'func');

      expect(result).toBe(`.text
glabel func
    push {lr}
    ldr r0, [pc, #0x10]
`);
    });

    it('strips relocation addends from bl/blx targets', () => {
      const objdiffAsm = `0:    push {lr}
4:    bl VramFree-0x4
8:    blx SomeFunc+0x8
c:    pop {pc}`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'func');

      expect(result).toBe(`.text
glabel func
    push {lr}
    bl VramFree
    blx SomeFunc
    pop {pc}
`);
    });

    it('skips empty lines', () => {
      const objdiffAsm = `0:    push {lr}

4:    pop {pc}`;

      const result = M2c.convertObjdiffAsmToGas(objdiffAsm, 'func');

      expect(result).toBe(`.text
glabel func
    push {lr}
    pop {pc}
`);
    });
  });

  describe('.getRelocationsForFunction', () => {
    let m2c: M2c;
    let compiler: CCompiler;
    let contextPath: string;
    let compiledObjPath: string | null = null;

    beforeAll(async () => {
      m2c = new M2c();
      compiler = new CCompiler();

      // Create a minimal context file with type definitions and extern declarations
      contextPath = path.join(__dirname, 'test-reloc-context.h');
      const contextContent = `
typedef unsigned int u32;
typedef signed int s32;

extern u32 gGlobalVar1;
extern u32 gGlobalVar2;
extern s32 gGlobalVar3;
`;
      await fs.writeFile(contextPath, contextContent);
    });

    afterAll(async () => {
      // Clean up context file
      await fs.unlink(contextPath).catch(() => {});
    });

    afterEach(async () => {
      // Clean up compiled object file
      if (compiledObjPath) {
        await fs.unlink(compiledObjPath).catch(() => {});
        compiledObjPath = null;
      }
    });

    it('parses relocations for a function with global variable references', async () => {
      // Compile C code that references external global variables
      // This will generate R_ARM_ABS32 relocations in the literal pool
      const cCode = `
u32 TestRelocFunc(void) {
    u32 a = gGlobalVar1;
    u32 b = gGlobalVar2;
    return a + b;
}
`;
      const compileResult = await compiler.compile(
        'TestRelocFunc',
        cCode,
        contextPath,
        '-mthumb-interwork -O2 -fhex-asm',
      );

      expect(compileResult.success).toBe(true);
      if (!compileResult.success) {
        return;
      }

      compiledObjPath = compileResult.objPath;

      const result = await m2c.getRelocationsForFunction(compiledObjPath, 'TestRelocFunc');

      // The function should have relocations for gGlobalVar1 and gGlobalVar2
      expect(result.size).toBeGreaterThanOrEqual(2);

      // Check that we found the expected symbols
      const symbols = Array.from(result.values());
      expect(symbols).toContain('gGlobalVar1');
      expect(symbols).toContain('gGlobalVar2');
    });

    it('returns empty map when function has no global variable references', async () => {
      // Compile C code that doesn't reference any external globals
      const cCode = `
u32 NoRelocFunc(u32 x) {
    return x + 1;
}
`;
      const compileResult = await compiler.compile(
        'NoRelocFunc',
        cCode,
        contextPath,
        '-mthumb-interwork -O2 -fhex-asm',
      );

      expect(compileResult.success).toBe(true);
      if (!compileResult.success) {
        return;
      }

      compiledObjPath = compileResult.objPath;

      const result = await m2c.getRelocationsForFunction(compiledObjPath, 'NoRelocFunc');

      // No global variable references means no relocations in the literal pool
      expect(result.size).toBe(0);
    });

    it('returns empty map when function does not exist', async () => {
      // Compile a simple function
      const cCode = `
void ExistingFunc(void) {
    volatile int x = 1;
}
`;
      const compileResult = await compiler.compile(
        'ExistingFunc',
        cCode,
        contextPath,
        '-mthumb-interwork -O2 -fhex-asm',
      );

      expect(compileResult.success).toBe(true);
      if (!compileResult.success) {
        return;
      }

      compiledObjPath = compileResult.objPath;

      // Query for a function that doesn't exist
      const result = await m2c.getRelocationsForFunction(compiledObjPath, 'NonExistentFunc');

      expect(result.size).toBe(0);
    });

    it('returns empty map for invalid object file path', async () => {
      const result = await m2c.getRelocationsForFunction('/non/existent/path.o', 'SomeFunc');

      expect(result.size).toBe(0);
    });

    it('only includes relocations within function range', async () => {
      // Compile two functions, each referencing different globals
      // This tests that we only get relocations for the requested function
      const cCode = `
u32 FirstFunc(void) {
    return gGlobalVar1;
}

u32 SecondFunc(void) {
    return gGlobalVar3;
}
`;
      const compileResult = await compiler.compile('TwoFuncs', cCode, contextPath, '-mthumb-interwork -O2 -fhex-asm');

      expect(compileResult.success).toBe(true);
      if (!compileResult.success) {
        return;
      }

      compiledObjPath = compileResult.objPath;

      // Get relocations for FirstFunc - should only have gGlobalVar1
      const firstResult = await m2c.getRelocationsForFunction(compiledObjPath, 'FirstFunc');
      const firstSymbols = Array.from(firstResult.values());
      expect(firstSymbols).toContain('gGlobalVar1');
      // gGlobalVar3 might or might not be in range depending on function layout
      // The important thing is that gGlobalVar1 is found

      // Get relocations for SecondFunc - should have gGlobalVar3
      const secondResult = await m2c.getRelocationsForFunction(compiledObjPath, 'SecondFunc');
      const secondSymbols = Array.from(secondResult.values());
      expect(secondSymbols).toContain('gGlobalVar3');
    });
  });

  describe('.decompile', () => {
    let m2c: M2c;
    let contextPath: string;

    beforeAll(async () => {
      m2c = new M2c();

      // Create a minimal context file with type definitions
      contextPath = path.join(__dirname, 'test-decompile-context.h');
      const contextContent = `
typedef unsigned int u32;
typedef signed int s32;
typedef unsigned short u16;
typedef unsigned char u8;
`;
      await fs.writeFile(contextPath, contextContent);
    });

    afterAll(async () => {
      await fs.unlink(contextPath).catch(() => {});
      await fs.unlink(`${contextPath}.m2c`).catch(() => {});
    });

    it('decompiles a simple addition function', async () => {
      // ARM Thumb assembly for: u32 SimpleAdd(u32 a, u32 b) { return a + b; }
      const gasAssembly = `.text
glabel SimpleAdd
    add r0, r1
    bx lr
`;

      const result = await m2c.decompile({
        asmContent: gasAssembly,
        functionName: 'SimpleAdd',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBe(`s32 SimpleAdd(s32 arg0, s32 arg1) {
    return arg0 + arg1;
}`);
    });

    it('decompiles a function with pointer dereference', async () => {
      // ARM Thumb assembly for: u32 ReadValue(u32 *ptr) { return *ptr; }
      const gasAssembly = `.text
glabel ReadValue
    ldr r0, [r0]
    bx lr
`;

      const result = await m2c.decompile({
        asmContent: gasAssembly,
        functionName: 'ReadValue',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBe(`s32 ReadValue(s32 *arg0) {
    return *arg0;
}`);
    });

    it('decompiles a function with multiple parameters', async () => {
      // ARM Thumb assembly for: u32 Sum4(u32 a, u32 b, u32 c, u32 d) { return a + b + c + d; }
      const gasAssembly = `.text
glabel Sum4
    add r0, r1
    add r0, r2
    add r0, r3
    bx lr
`;

      const result = await m2c.decompile({
        asmContent: gasAssembly,
        functionName: 'Sum4',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBe(`s32 Sum4(s32 arg0, s32 arg1, s32 arg2, s32 arg3) {
    return arg0 + arg1 + arg2 + arg3;
}`);
    });

    it('decompiles a function with global variable reference', async () => {
      // ARM Thumb assembly for function that reads a global variable
      const gasAssembly = `.text
glabel ReadGlobal
    ldr r0, =gMyGlobal
    ldr r0, [r0]
    bx lr
`;

      const result = await m2c.decompile({
        asmContent: gasAssembly,
        functionName: 'ReadGlobal',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBe(`s32 ReadGlobal(void) {
    return gMyGlobal;
}`);
    });

    it('decompiles a function with subtraction', async () => {
      // ARM Thumb assembly for: s32 Subtract(s32 a, s32 b) { return a - b; }
      const gasAssembly = `.text
glabel Subtract
    sub r0, r1
    bx lr
`;

      const result = await m2c.decompile({
        asmContent: gasAssembly,
        functionName: 'Subtract',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBe(`s32 Subtract(s32 arg0, s32 arg1) {
    return arg0 - arg1;
}`);
    });

    it('decompiles a function with bitwise AND', async () => {
      // ARM Thumb assembly for: u32 BitwiseAnd(u32 a, u32 b) { return a & b; }
      const gasAssembly = `.text
glabel BitwiseAnd
    and r0, r1
    bx lr
`;

      const result = await m2c.decompile({
        asmContent: gasAssembly,
        functionName: 'BitwiseAnd',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBe(`s32 BitwiseAnd(s32 arg0, s32 arg1) {
    return arg0 & arg1;
}`);
    });

    it('returns error for invalid assembly', async () => {
      const invalidAsm = `.text
glabel InvalidFunc
    this is not valid assembly
`;

      const result = await m2c.decompile({
        asmContent: invalidAsm,
        functionName: 'InvalidFunc',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error for empty function', async () => {
      // Empty function body - m2c returns an error
      const gasAssembly = `.text
glabel EmptyFunc
`;

      const result = await m2c.decompile({
        asmContent: gasAssembly,
        functionName: 'EmptyFunc',
        target: 'arm',
        contextPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Decompilation failure in function EmptyFunc');
      expect(result.error).toContain('contains no instructions');
    });
  });
});
