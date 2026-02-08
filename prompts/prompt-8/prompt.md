You are decompiling an assembly function called `sub_808D000` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `InputRecorderResetRecordHead`

```c
void InputRecorderResetRecordHead(void) { gInputRecorder.recordHead = 0; }
```

```asm
ldr r1, [pc, #0x4] @ =gInputRecorder
mov r0, #0x0
str r0, [r1, #0x4]
bx lr
.word gInputRecorder
```

## `InputRecorderResetPlaybackHead`

```c
void InputRecorderResetPlaybackHead(void) { gInputRecorder.playbackHead = 0; }
```

```asm
ldr r1, [pc, #0x4] @ =gInputRecorder
mov r0, #0x0
str r0, [r1, #0x0]
bx lr
.word gInputRecorder
```

## `StopFlashTimer`

```c
void StopFlashTimer(void)
{
    REG_IME = 0;
    *gTimerReg++ = 0;
    *gTimerReg-- = 0;
    REG_IE &= ~(INTR_FLAG_TIMER0 << sTimerNum);
    REG_IME = gSavedIme;
}
```

```asm
ldr r3, [pc, #0x2c] @ =#0x4000208
mov r1, #0x0
strh r1, [r3, #0x0]
ldr r2, [pc, #0x2c] @ =gTimerReg
ldr r0, [r2, #0x0]
strh r1, [r0, #0x0]
add r0, #0x2
str r0, [r2, #0x0]
strh r1, [r0, #0x0]
sub r0, #0x2
str r0, [r2, #0x0]
ldr r2, [pc, #0x20] @ =#0x4000200
ldr r0, [pc, #0x20] @ =sTimerNum
ldrb r0, [r0, #0x0]
mov r1, #0x8
lsl r1, r0
ldrh r0, [r2, #0x0]
bic r0, r1
strh r0, [r2, #0x0]
ldr r0, [pc, #0x18] @ =gSavedIme
ldrh r0, [r0, #0x0]
strh r0, [r3, #0x0]
bx lr
.hword #0x0
.word #0x4000208
.word gTimerReg
.word #0x4000200
.word sTimerNum
.word gSavedIme
```

## `MultiBootInit`

```c
void MultiBootInit(struct MultiBootParam *mp) { MULTIBOOT_INIT(mp); }
```

```asm
mov r2, r0
mov r1, #0x0
strb r1, [r2, #0x1e]
strb r1, [r2, #0x18]
strb r1, [r2, #0x1d]
mov r3, r2
add r3, #0x4a
mov r0, #0xf
strb r0, [r3, #0x0]
mov r0, r2
add r0, #0x48
strb r1, [r0, #0x0]
strh r1, [r2, #0x16]
ldr r0, [pc, #0x10] @ =#0x4000134
strh r1, [r0, #0x0]
ldr r2, [pc, #0x10] @ =#0x4000128
ldr r3, [pc, #0x10] @ =#0x2003
mov r0, r3
strh r0, [r2, #0x0]
ldr r0, [pc, #0x10] @ =#0x400012a
strh r1, [r0, #0x0]
bx lr
.word #0x4000134
.word #0x4000128
.word #0x2003
.word #0x400012a
```

## `GamepakIntr`

```c
static void GamepakIntr(void) { REG_IF = INTR_FLAG_GAMEPAK; }
```

```asm
ldr r1, [pc, #0x8] @ =#0x4000202
mov r2, #0x80
lsl r2, r2, #0x6
mov r0, r2
strh r0, [r1, #0x0]
bx lr
.word #0x4000202
```

# Primary Objective

Decompile the following target assembly function from `asm/code.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
	thumb_func_start sub_808D000
sub_808D000: @ 0x0808D000
	ldr r1, _0808D008 @ =gWinRegs
	movs r0, #0
	strh r0, [r1, #8]
	bx lr
	.align 2, 0
_0808D008: .4byte gWinRegs

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
