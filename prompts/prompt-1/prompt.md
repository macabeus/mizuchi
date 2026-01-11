You are decompiling an assembly function called `TaskDestructor_CharacterSelect` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `TaskDestructor_SunsetBridge`

```c
void TaskDestructor_SunsetBridge(struct Task *t)
{
    SunsetBridge *bridge = TASK_DATA(t);
    VramFree(bridge->s.tiles);
}
```

```asm
push {lr}
ldrh r0, [r0, #0x6]
ldr r1, [pc, #0xc] @ =#0x3000080
add r0, r0, r1
ldr r0, [r0, #0x0]
bl VramFree-0x4
pop {r0}
bx r0
.hword #0x0
.word #0x3000080
```

## `TaskDestructor_GuruGuru`

```c
void TaskDestructor_GuruGuru(Task *t)
{
    GuruGuru *enemy = TASK_DATA(t);
    VramFree(enemy->s[NUM_SPRITES - 1].tiles);
}
```

```asm
push {lr}
ldrh r0, [r0, #0x6]
ldr r1, [pc, #0xc] @ =#0x30000b0
add r0, r0, r1
ldr r0, [r0, #0x0]
bl VramFree-0x4
pop {r0}
bx r0
.hword #0x0
.word #0x30000b0
```

## `TaskDestructor_BonusUfo`

```c
void TaskDestructor_BonusUfo(struct Task *t)
{
    BonusUfo *ufo = TASK_DATA(t);
    VramFree(ufo->tiles);
}
```

```asm
push {lr}
ldrh r0, [r0, #0x6]
ldr r1, [pc, #0xc] @ =#0x30000ac
add r0, r0, r1
ldr r0, [r0, #0x0]
bl VramFree-0x4
pop {r0}
bx r0
.hword #0x0
.word #0x30000ac
```

## `TaskDestructor_PlatformMaybeFalling`

```c
void TaskDestructor_PlatformMaybeFalling(struct Task *t)
{
    PlatformMaybeFalling *platform = TASK_DATA(t);
    VramFree(platform->tiles);
}
```

```asm
push {lr}
ldrh r0, [r0, #0x6]
ldr r1, [pc, #0xc] @ =#0x30000ac
add r0, r0, r1
ldr r0, [r0, #0x0]
bl VramFree-0x4
pop {r0}
bx r0
.hword #0x0
.word #0x30000ac
```

## `TaskDestructor_Pendulum`

```c
void TaskDestructor_Pendulum(struct Task *t)
{
    Pendulum *pend = TASK_DATA(t);
    VramFree(pend->tiles);
}
```

```asm
push {lr}
ldrh r0, [r0, #0x6]
ldr r1, [pc, #0xc] @ =#0x3000178
add r0, r0, r1
ldr r0, [r0, #0x0]
bl VramFree-0x4
pop {r0}
bx r0
.hword #0x0
.word #0x3000178
```

# Function declaration for the target assmebly

`void TaskDestructor_CharacterSelect(struct Task *t);`

# Declarations for the functions called from the target assembly

- `void VramFree(void *);`

# Types definitions used in the declarations

```c
typedef struct Task {
               TaskPtr parent;
               TaskPtr prev;
               TaskPtr next;
               IwramData data;
               TaskMain main;
               TaskDestructor dtor;
               u16 priority;
               u16 flags;
} Task;
```

```c
typedef struct Task {
    /* 0x00 */ TaskPtr parent;
    /* 0x02 */ TaskPtr prev;
    /* 0x04 */ TaskPtr next;
    /* 0x06 */ IwramData data;
#if PORTABLE
    u32 dataSize;
#endif // PORTABLE
    /* 0x08 */ TaskMain main;
    /* 0x0C */ TaskDestructor dtor;
    /* 0x10 */ u16 priority; // priority?
    /* 0x12 */ u16 flags; // 0x1  = active
                          // 0x2  = ???
                          // 0x10 = use ewram for struct
#if USE_SA2_TASK_SYSTEM
    /* 0x14 */ u8 unk14;
    /* 0x15 */ u8 unk15;
    /* 0x16 */ u16 unk16;
    /* 0x18 */ u16 unk18;
#endif // USE_SA2_TASK_SYSTEM

#if ENABLE_TASK_LOGGING
    const char *name;
#endif
} Task;
```

# Primary Objective

Decompile the following target assembly function from `asm/character_select.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
	thumb_func_start TaskDestructor_CharacterSelect
TaskDestructor_CharacterSelect: @ 0x0809B758
	push {lr}
	ldrh r0, [r0, #6]
	ldr r1, _0809B76C @ =0x030000C4
	adds r0, r0, r1
	ldr r0, [r0]
	bl VramFree
	pop {r0}
	bx r0
	.align 2, 0
_0809B76C: .4byte 0x030000C4

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
