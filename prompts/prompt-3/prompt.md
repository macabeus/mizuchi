You are decompiling an assembly function called `sub_8071864` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `Task_805BEAC`

```c
void Task_805BEAC(void)
{
    Jousun *enemy = TASK_DATA(gCurTask);

    AnimCmdResult acmdRes = sub_805BF7C(enemy);

    if (sub_805BFEC(enemy) == TRUE) {
        TaskDestroy(gCurTask);
        return;
    }

    if (acmdRes == ACMD_RESULT__ENDED) {
        Sprite *s = &enemy->s;
        s->anim = gUnknown_080D1F2C[2].anim;
        s->variant = gUnknown_080D1F2C[2].variant;
        gCurTask->main = sub_805BA78;
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
ldr r7, [pc, #0x24] @ =gCurTask
ldr r0, [r7, #0x0]
ldrh r6, [r0, #0x6]
mov r4, #0xc0
lsl r4, r4, #0x12
add r4, r6, r4
mov r0, r4
bl sub_805BF7C-0x4
mov r5, r0
mov r0, r4
bl sub_805BFEC-0x4
cmp r0, #0x1
bne .L2c
ldr r0, [r7, #0x0]
bl TaskDestroy-0x4
b .L44
.word gCurTask
.L2c:
cmp r5, #0x0
bne .L44
ldr r0, [pc, #0x18] @ =#0x3000030
add r2, r6, r0
ldr r1, [pc, #0x18] @ =gUnknown_080D1F2C
ldrh r0, [r1, #0x10]
strh r0, [r2, #0xc]
ldrb r0, [r1, #0x12]
strb r0, [r2, #0x1a]
ldr r1, [r7, #0x0]
ldr r0, [pc, #0x10] @ =sub_805BA78
str r0, [r1, #0x8]
.L44:
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.hword #0x0
.word #0x3000030
.word gUnknown_080D1F2C
.word sub_805BA78
```

## `Task_80379F4`

```c
void Task_80379F4(void)
{
    DecoRock *deco = TASK_DATA(gCurTask);
    MapEntity *me = deco->base.me;

    sub_8037A44();

    if ((deco->unk86 & 0x2) || (deco->unk86 > 30)) {
        sub_8037828();
    }

    if (deco->unk86 == 0) {
        SET_MAP_ENTITY_NOT_INITIALIZED(me, deco->base.meX);
        TaskDestroy(gCurTask);
        return;
    }
}
```

```asm
push {r4, r5, r6, lr}
ldr r0, [pc, #0x44] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r4, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r5, r4, r0
ldr r6, [r5, #0x0]
bl .L4c
ldr r0, [pc, #0x34] @ =#0x3000086
add r4, r4, r0
ldrb r4, [r4, #0x0]
mov r0, #0x2
and r0, r4
cmp r0, #0x0
bne .L26
cmp r4, #0x1e
bls .L2a
.L26:
bl sub_8037828-0x4
.L2a:
mov r0, r5
add r0, #0x86
ldrb r0, [r0, #0x0]
cmp r0, #0x0
bne .L40
ldrb r0, [r5, #0xa]
strb r0, [r6, #0x0]
ldr r0, [pc, #0xc] @ =gCurTask
ldr r0, [r0, #0x0]
bl TaskDestroy-0x4
.L40:
pop {r4, r5, r6}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
.L4c:
.word #0x3000086
```

## `Task_803E7DC`

```c
void Task_803E7DC(void)
{
    TriggerBossOrGoal *trig = TASK_DATA(gCurTask);

    if (trig->unk2F == 0) {
        if (trig->bossTask) {
            TaskDestroy(trig->bossTask);
            trig->bossTask = NULL;
        }

        gCurTask->main = Task_803E818;
    }

    sub_803E700();
}
```

```asm
push {r4, r5, r6, lr}
ldr r6, [pc, #0x30] @ =gCurTask
ldr r0, [r6, #0x0]
ldrh r0, [r0, #0x6]
mov r1, #0xc0
lsl r1, r1, #0x12
add r5, r0, r1
add r1, #0x2f
add r0, r0, r1
ldrb r4, [r0, #0x0]
cmp r4, #0x0
bne .L2a
ldr r0, [r5, #0x30]
cmp r0, #0x0
beq .L24
bl TaskDestroy-0x4
str r4, [r5, #0x30]
.L24:
ldr r1, [r6, #0x0]
ldr r0, [pc, #0x10] @ =Task_803E818
str r0, [r1, #0x8]
.L2a:
bl sub_803E700-0x4
pop {r4, r5, r6}
pop {r0}
bx r0
.word gCurTask
.word Task_803E818
```

## `Task_JugglingPin`

```c
void Task_JugglingPin(void)
{
    Sprite2 *s;
    bool32 var_r5;

    JugglingPin *proj = TASK_DATA(gCurTask);

    var_r5 = sub_805EB68(proj);
    sub_805EBB4(proj);

    if (var_r5 == 1) {
        *proj->unk4 = 0;
        TaskDestroy(gCurTask);
        return;
    }

    if (sub_805E814(proj) == 1) {
        var_r5 = 1;
    }

    if (var_r5 == 1) {
        s = &proj->s;
        s->anim = gUnknown_080D1F7C[1].anim;
        s->variant = gUnknown_080D1F7C[1].variant;
        gCurTask->main = Task_805EB34;
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
ldr r7, [pc, #0x2c] @ =gCurTask
ldr r0, [r7, #0x0]
ldrh r6, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r4, r6, r0
mov r0, r4
bl sub_805EB68-0x4
mov r5, r0
mov r0, r4
bl sub_805EBB4-0x4
cmp r5, #0x1
bne .L34
ldr r0, [r4, #0x4]
mov r1, #0x0
strb r1, [r0, #0x0]
ldr r0, [r7, #0x0]
bl TaskDestroy-0x4
b .L58
.hword #0x0
.word gCurTask
.L34:
mov r0, r4
bl sub_805E814-0x4
cmp r0, #0x1
bne .L40
mov r5, #0x1
.L40:
cmp r5, #0x1
bne .L58
ldr r0, [pc, #0x18] @ =#0x3000028
add r2, r6, r0
ldr r1, [pc, #0x18] @ =gUnknown_080D1F7C
ldrh r0, [r1, #0x8]
strh r0, [r2, #0xc]
ldrb r0, [r1, #0xa]
strb r0, [r2, #0x1a]
ldr r1, [r7, #0x0]
ldr r0, [pc, #0x10] @ =Task_805EB34
str r0, [r1, #0x8]
.L58:
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.hword #0x0
.word #0x3000028
.word gUnknown_080D1F7C
.word Task_805EB34
```

## `Task_BuzzerProjectileInit`

```c
void Task_BuzzerProjectileInit(void)
{
    BuzzerProjectile *proj = TASK_DATA(gCurTask);
    sub_805A3E4(proj);
    sub_805A464(proj);
    sub_805A194(proj);

    if (sub_805A424(proj) == TRUE) {
        TaskDestroy(gCurTask);
        return;
    }
}
```

```asm
push {r4, r5, lr}
ldr r5, [pc, #0x34] @ =gCurTask
ldr r0, [r5, #0x0]
ldrh r4, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r4, r4, r0
mov r0, r4
bl .L38
mov r0, r4
bl sub_805A464-0x4
mov r0, r4
bl sub_805A194-0x4
mov r0, r4
bl sub_805A424-0x4
cmp r0, #0x1
bne .L30
ldr r0, [r5, #0x0]
bl TaskDestroy-0x4
.L30:
pop {r4, r5}
pop {r0}
bx r0
.hword #0x0
.L38:
.word gCurTask
```

# Declarations for the functions called from the target assembly

- `void TaskDestroy(struct Task *);`

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

Decompile the following target assembly function from `asm/code.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
	thumb_func_start sub_8071864
sub_8071864: @ 0x08071864
	push {r4, r5, r6, r7, lr}
	sub sp, #4
	ldr r0, _08071890 @ =gCurTask
	ldr r2, [r0]
	ldrh r1, [r2, #6]
	movs r0, #0xc0
	lsls r0, r0, #0x12
	adds r6, r1, r0
	ldr r4, [r6]
	movs r0, #0x82
	lsls r0, r0, #1
	adds r7, r4, r0
	ldrh r0, [r6, #4]
	cmp r0, #0
	beq _08071888
	ldrb r0, [r4, #0x1c]
	cmp r0, #0
	bne _08071894
_08071888:
	adds r0, r2, #0
	bl TaskDestroy
	b _080718D4
	.align 2, 0
_08071890: .4byte gCurTask
_08071894:
	adds r0, r6, #0
	adds r1, r4, #0
	bl sub_80707A0
	adds r5, r4, #0
	adds r5, #0xa8
	ldr r1, [r5]
	asrs r1, r1, #8
	adds r4, #0xac
	ldr r2, [r4]
	asrs r2, r2, #8
	ldr r0, [r6]
	ldr r0, [r0, #0x40]
	str r0, [sp]
	adds r0, r7, #0
	movs r3, #0
	bl sub_8020CE0
	ldr r1, [r5]
	asrs r1, r1, #8
	ldr r2, [r4]
	asrs r2, r2, #8
	ldr r0, [r6]
	ldr r0, [r0, #0x44]
	str r0, [sp]
	adds r0, r7, #0
	movs r3, #0
	bl sub_8020CE0
	ldr r0, [r6]
	bl sub_080711C8
_080718D4:
	add sp, #4
	pop {r4, r5, r6, r7}
	pop {r0}
	bx r0

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
