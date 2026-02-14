import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { M2c } from './m2c.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('M2c', () => {
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
