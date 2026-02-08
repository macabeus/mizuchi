You are decompiling an assembly function called `sub_8028850` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `sub_80001EC`

```c
void sub_80001EC(void)
{
    u16 *maxTileSlots;
    void *vram;
    u16 tileSlots;

    sub_80003B8();
    gStageData.unk7 = 0;
    gStageData.levelTimer = 0;
    gStageData.timer = 0;
    gStageData.unk8 = 0;
    gTask_03001CFC = NULL;
    maxTileSlots = &gVramHeapMaxTileSlots;
    vram = OBJ_VRAM0 + (620 * TILE_SIZE_4BPP);
    tileSlots = 1616 / VRAM_TILE_SLOTS_PER_SEGMENT;
    *maxTileSlots = tileSlots;
    gVramHeapStartAddr = vram;
    sub_8001DDC(0U);

    if (gFlags & 0x100) {
        CallCompleteSave();
        TaskCreate(Task_8000284, 0U, 0x100U, 0U, NULL);
    } else if (sub_8001E94()) {
        sub_8001E84();
        TaskCreate(Task_8000284, 0U, 0x100U, 0U, NULL);
    } else {
        sub_8000390();
    }
}
```

```asm
push {r4, r5, r6, lr}
sub sp, sp, #0x4
bl sub_80003B8-0x4
ldr r0, [pc, #0x40] @ =gStageData
mov r5, #0x0
strb r5, [r0, #0x7]
mov r2, r0
add r2, #0xae
mov r1, #0x0
strh r5, [r2, #0x0]
str r5, [r0, #0x1c]
strb r1, [r0, #0x8]
ldr r0, [pc, #0x34] @ =gTask_03001CFC
str r5, [r0, #0x0]
ldr r1, [pc, #0x34] @ =gVramHeapMaxTileSlots
ldr r2, [pc, #0x34] @ =#0x6014d80
mov r0, #0xca
lsl r0, r0, #0x1
strh r0, [r1, #0x0]
ldr r0, [pc, #0x30] @ =gVramHeapStartAddr
str r2, [r0, #0x0]
mov r0, #0x0
bl sub_8001DDC-0x4
ldr r0, [pc, #0x2c] @ =gFlags
ldr r4, [r0, #0x0]
mov r6, #0x80
lsl r6, r6, #0x1
and r4, r6
cmp r4, #0x0
beq .L68
bl CallCompleteSave-0x4
ldr r0, [pc, #0x1c] @ =Task_8000284
str r5, [sp, #0x0]
b .L7a
.hword #0x0
.word gStageData
.word gTask_03001CFC
.word gVramHeapMaxTileSlots
.word #0x6014d80
.word gVramHeapStartAddr
.word gFlags
.word Task_8000284
.L68:
bl sub_8001E94-0x4
lsl r0, r0, #0x10
cmp r0, #0x0
beq .L8c
bl sub_8001E84-0x4
ldr r0, [pc, #0x10] @ =Task_8000284
str r4, [sp, #0x0]
.L7a:
mov r1, #0x0
mov r2, r6
mov r3, #0x0
bl TaskCreate-0x4
b .L90
.hword #0x0
.word Task_8000284
.L8c:
bl sub_8000390-0x4
.L90:
add sp, #0x4
pop {r4, r5, r6}
pop {r0}
bx r0
```

## `Task_8000284`

```c
void Task_8000284(void)
{
    DmaFill32(3, 0, BG_CHAR_ADDR_FROM_BGCNT(2), 2 * TILE_SIZE_4BPP);
    gBgSprites_Unknown1[2] = 0;
    gBgSprites_Unknown2[2][0] = 0;
    gBgSprites_Unknown2[2][1] = 0;
    gBgSprites_Unknown2[2][2] = 0xFF;
    gBgSprites_Unknown2[2][3] = 0x40;
    gBgScrollRegs[2][0] = 0;
    gBgScrollRegs[2][1] = 0;
    gStageData.timer = 0;
    sub_80003B8();
    CreateGameIntroState(1);

    TaskDestroy(gCurTask);
}
```

```asm
push {lr}
sub sp, sp, #0x4
mov r2, #0x0
str r2, [sp, #0x0]
ldr r3, [pc, #0x50] @ =#0x40000d4
mov r0, sp
str r0, [r3, #0x0]
ldr r0, [pc, #0x50] @ =gBgCntRegs
ldrh r1, [r0, #0x4]
mov r0, #0xc
and r0, r1
lsl r0, r0, #0xc
mov r1, #0xc0
lsl r1, r1, #0x13
add r0, r0, r1
str r0, [r3, #0x4]
ldr r0, [pc, #0x40] @ =#0x85000010
str r0, [r3, #0x8]
ldr r0, [r3, #0x8]
ldr r0, [pc, #0x40] @ =gBgSprites_Unknown1
strb r2, [r0, #0x2]
ldr r1, [pc, #0x40] @ =gBgSprites_Unknown2
strb r2, [r1, #0x8]
strb r2, [r1, #0x9]
mov r0, #0xff
strb r0, [r1, #0xa]
mov r0, #0x40
strb r0, [r1, #0xb]
ldr r0, [pc, #0x34] @ =gBgScrollRegs
strh r2, [r0, #0x8]
strh r2, [r0, #0xa]
ldr r0, [pc, #0x34] @ =gStageData
str r2, [r0, #0x1c]
bl sub_80003B8-0x4
mov r0, #0x1
bl CreateGameIntroState-0x4
ldr r0, [pc, #0x28] @ =gCurTask
ldr r0, [r0, #0x0]
bl TaskDestroy-0x4
add sp, #0x4
pop {r0}
bx r0
.hword #0x0
.word #0x40000d4
.word gBgCntRegs
.word #0x85000010
.word gBgSprites_Unknown1
.word gBgSprites_Unknown2
.word gBgScrollRegs
.word gStageData
.word gCurTask
```

## `sub_8064C18`

```c
void sub_8064C18(s32 arg0, s32 arg1, u16 arg2, u16 arg3, u8 arg4, u8 arg5)
{
    s32 temp_r1_2;
    KamakiProj *proj;
#ifndef NON_MATCHING
    register s32 var_r0 asm("r0");
#else
    s32 var_r0;
#endif

    proj = TASK_DATA(TaskCreate(Task_8064E10, sizeof(KamakiProj), 0x4040U, 0U, TaskDestructor_80651BC));
    proj->region[0] = arg2;
    proj->region[1] = arg3;
    proj->unkC = +Q(5);
    proj->unkA = -Q(5);
    proj->unkE = 0;
    proj->rotations[0] = 0;
    proj->rotations[1] = 0;
    proj->unk0 = arg5;
    temp_r1_2 = Q(gUnknown_080D217C[arg4]);
    var_r0 = (temp_r1_2 - Q(8));
    proj->qUnk10[0].x = var_r0 + arg0;
    var_r0 = Q(8);
    temp_r1_2 += var_r0;
    arg0 += temp_r1_2;
    proj->qUnk10[1].x = arg0;

    if (arg5 != 0) {
        var_r0 = +Q(32);
        var_r0 += arg1;
    } else {
        var_r0 = -Q(32);
        var_r0 += arg1;
    }

    proj->qUnk10[0].y = var_r0;
    proj->qUnk10[1].y = var_r0;
    CpuFill16(0, &proj->s[0].hitboxes[1].b, sizeof(proj->s[0].hitboxes[1].b));
    CpuFill16(0, &proj->s[1].hitboxes[1].b, sizeof(proj->s[1].hitboxes[1].b));
    sub_8064D04(proj);
}
```

```asm
push {r4, r5, r6, r7, lr}
mov r7, r10
mov r6, r9
mov r5, r8
push {r5, r6, r7}
sub sp, sp, #0x8
mov r9, r0
mov r10, r1
mov r5, r2
mov r6, r3
ldr r4, [sp, #0x28]
ldr r0, [sp, #0x2c]
mov r8, r0
lsl r5, r5, #0x10
lsr r5, r5, #0x10
lsl r6, r6, #0x10
lsr r6, r6, #0x10
lsl r4, r4, #0x18
lsr r4, r4, #0x18
mov r2, r8
lsl r2, r2, #0x18
lsr r2, r2, #0x18
mov r8, r2
ldr r0, [pc, #0x60] @ =Task_8064E10
ldr r2, [pc, #0x60] @ =#0x4040
ldr r1, [pc, #0x64] @ =TaskDestructor_80651BC
str r1, [sp, #0x0]
mov r1, #0x98
mov r3, #0x0
bl TaskCreate-0x4
ldrh r1, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r7, r1, r0
mov r1, #0x0
strh r5, [r7, #0x2]
strh r6, [r7, #0x4]
mov r0, #0xa0
lsl r0, r0, #0x3
strh r0, [r7, #0xc]
mov r0, #0xfb
lsl r0, r0, #0x8
strh r0, [r7, #0xa]
strh r1, [r7, #0xe]
strh r1, [r7, #0x6]
strh r1, [r7, #0x8]
mov r0, r8
strb r0, [r7, #0x0]
ldr r0, [pc, #0x38] @ =gUnknown_080D217C
lsl r4, r4, #0x1
add r4, r4, r0
mov r2, #0x0
ldrsh r1, [r4, r2]
lsl r1, r1, #0x8
ldr r2, [pc, #0x30] @ =#0xfffff800
add r0, r1, r2
add r0, r9
str r0, [r7, #0x10]
mov r0, #0x80
lsl r0, r0, #0x4
add r1, r1, r0
add r9, r1
mov r2, r9
str r2, [r7, #0x18]
mov r0, r8
cmp r0, #0x0
beq .La4
mov r0, #0x80
lsl r0, r0, #0x6
b .La6
.hword #0x0
.word Task_8064E10
.word #0x4040
.word TaskDestructor_80651BC
.word gUnknown_080D217C
.word #0xfffff800
.La4:
ldr r0, [pc, #0x3c] @ =#0xffffe000
.La6:
add r0, r10
str r0, [r7, #0x14]
str r0, [r7, #0x1c]
add r0, sp, #0x4
mov r4, #0x0
strh r4, [r0, #0x0]
mov r1, r7
add r1, #0x64
ldr r5, [pc, #0x30] @ =#0x1000002
mov r2, r5
bl CpuSet-0x4
mov r0, sp
add r0, #0x6
strh r4, [r0, #0x0]
mov r1, r7
add r1, #0x94
mov r2, r5
bl CpuSet-0x4
mov r0, r7
bl .Le8
add sp, #0x8
pop {r3, r4, r5}
mov r8, r3
mov r9, r4
mov r10, r5
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.word #0xffffe000
.Le8:
.word #0x1000002
```

## `CreateEntity_Jousun_Left`

```c
void CreateEntity_Jousun_Left(MapEntity *me, u16 regionX, u16 regionY, u8 id)
{
    struct Task *t = TaskCreate(Task_JousunMain, sizeof(Jousun), 0x2100, 0, TaskDestructor_Jousun);
    Jousun *enemy = TASK_DATA(t);

    sub_805BF38(enemy, me, regionX, regionY, id);
    sub_805B980(enemy);

    enemy->s.frameFlags |= SPRITE_FLAG(X_FLIP, 1);

    SET_MAP_ENTITY_INITIALIZED(me);
}
```

```asm
push {r4, r5, r6, lr}
mov r6, r9
mov r5, r8
push {r5, r6}
sub sp, sp, #0x4
mov r9, r0
mov r6, r1
mov r8, r2
mov r5, r3
lsl r6, r6, #0x10
lsr r6, r6, #0x10
mov r0, r8
lsl r0, r0, #0x10
lsr r0, r0, #0x10
mov r8, r0
lsl r5, r5, #0x18
lsr r5, r5, #0x18
ldr r0, [pc, #0x50] @ =Task_JousunMain
mov r2, #0x84
lsl r2, r2, #0x6
ldr r1, [pc, #0x4c] @ =TaskDestructor_Jousun
str r1, [sp, #0x0]
mov r1, #0x60
mov r3, #0x0
bl TaskCreate-0x4
ldrh r4, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r4, r4, r0
str r5, [sp, #0x0]
mov r0, r4
mov r1, r9
mov r2, r6
mov r3, r8
bl sub_805BF38-0x4
mov r0, r4
bl sub_805B980-0x4
ldr r0, [r4, #0x38]
mov r1, #0x80
lsl r1, r1, #0x3
orr r0, r1
str r0, [r4, #0x38]
mov r1, #0x2
neg r1, r1
mov r0, r1
mov r1, r9
strb r0, [r1, #0x0]
add sp, #0x4
pop {r3, r4}
mov r8, r3
mov r9, r4
pop {r4, r5, r6}
pop {r0}
bx r0
.hword #0x0
.word Task_JousunMain
.word TaskDestructor_Jousun
```

## `Task_806152C`

```c
void Task_806152C(void)
{
    Stack_806152C sp00;
    Sprite2 *s;
    u32 temp_r7;
    u8 var_r3;
    AnimCmdResult acmdRes;

    Hariisen *enemy = TASK_DATA(gCurTask);

    temp_r7 = sub_80617E0(enemy, 1U);
    sub_8061AC8(enemy);
    acmdRes = sub_806253C(enemy);
    sub_8061BD4(enemy);
    sub_80619EC(enemy);
    if (gStageData.unk4 != 1 && gStageData.unk4 != 2 && gStageData.unk4 != 4) {
        if ((acmdRes == ACMD_RESULT__ENDED) && (temp_r7 == 1)) {
            if (++enemy->unkA == 80) {
                s = &enemy->s;
                s->anim = gUnknown_080D2044[2].anim;
                s->variant = gUnknown_080D2044[2].variant;
                s->frameFlags &= ~0x40000;
                sp00.unk4.x = enemy->qPos.x;
                sp00.unk4.y = enemy->qPos.y;
                sp00.unk8.x = enemy->region[0];
                sp00.unk8.y = enemy->region[1];
                sp00.unkC[0] = enemy->unk10;
                sp00.unkC[1] = enemy->unk14;
                sub_8061D3C(sp00);

                for (var_r3 = 0; var_r3 < 2; var_r3++) {
                    enemy->qUnk2C[var_r3].x = 0;
                    enemy->qUnk2C[var_r3].y = 0;
                    enemy->unk10[var_r3] = 0;
                }

                for (var_r3 = 0; var_r3 < 4; var_r3++) {
                    enemy->qUnk3C[var_r3].x = 0;
                    enemy->qUnk3C[var_r3].y = 0;
                    enemy->unk14[var_r3] = 0;
                }

                enemy->unkA = 0;
                enemy->unkC[0] = 0;
                enemy->unkC[1] = 0;
                gCurTask->main = Task_80624E4;
                return;
            }
        }
        if (sub_8062580(enemy) == 1) {
            TaskDestroy(gCurTask);
        }
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
mov r7, r10
mov r6, r9
mov r5, r8
push {r5, r6, r7}
sub sp, sp, #0x18
ldr r0, [pc, #0x10c] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r6, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r5, r6, r0
mov r0, r5
mov r1, #0x1
bl sub_80617E0-0x4
mov r7, r0
mov r0, r5
bl sub_8061AC8-0x4
mov r0, r5
bl sub_806253C-0x4
mov r4, r0
mov r0, r5
bl sub_8061BD4-0x4
mov r0, r5
bl sub_80619EC-0x4
ldr r0, [pc, #0xe0] @ =gStageData
ldrb r1, [r0, #0x4]
subs r0, r1, #0x1
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0x1
bhi .L4c
b .L15e
.L4c:
cmp r1, #0x4
bne .L52
b .L15e
.L52:
cmp r4, #0x0
bne .L14c
cmp r7, #0x1
bne .L14c
ldrh r0, [r5, #0xa]
add r0, #0x1
strh r0, [r5, #0xa]
lsl r0, r0, #0x10
lsr r0, r0, #0x10
cmp r0, #0x50
bne .L14c
ldr r0, [pc, #0xb8] @ =#0x300005c
add r2, r6, r0
ldr r1, [pc, #0xb8] @ =gUnknown_080D2044
ldrh r0, [r1, #0x10]
strh r0, [r2, #0xc]
ldrb r0, [r1, #0x12]
strb r0, [r2, #0x1a]
ldr r0, [r2, #0x8]
ldr r1, [pc, #0xb0] @ =#0xfffbffff
and r0, r1
str r0, [r2, #0x8]
ldr r0, [r5, #0x24]
str r0, [sp, #0x4]
ldr r0, [r5, #0x28]
str r0, [sp, #0x8]
add r1, sp, #0x4
ldrh r0, [r5, #0x6]
strh r0, [r1, #0x8]
ldrh r0, [r5, #0x8]
strh r0, [r1, #0xa]
ldr r1, [pc, #0x9c] @ =#0x3000010
add r4, r6, r1
str r4, [sp, #0x10]
add r1, #0x4
add r0, r6, r1
str r0, [sp, #0x14]
str r0, [sp, #0x0]
ldr r0, [sp, #0x4]
ldr r1, [sp, #0x8]
ldr r2, [sp, #0xc]
mov r3, r4
bl sub_8061D3C-0x4
mov r3, #0x0
ldr r0, [pc, #0x84] @ =#0x300003c
add r0, r0, r6
mov r12, r0
ldr r1, [pc, #0x84] @ =#0x3000040
add r1, r1, r6
mov r8, r1
ldr r0, [pc, #0x80] @ =#0x3000014
add r0, r0, r6
mov r9, r0
ldr r1, [pc, #0x80] @ =#0x300002c
add r7, r6, r1
mov r2, #0x0
ldr r0, [pc, #0x7c] @ =#0x3000030
add r6, r6, r0
.Lc8:
lsl r1, r3, #0x3
add r0, r7, r1
str r2, [r0, #0x0]
add r1, r6, r1
str r2, [r1, #0x0]
lsl r0, r3, #0x1
add r0, r4, r0
strh r2, [r0, #0x0]
add r0, r3, #0x1
lsl r0, r0, #0x18
lsr r3, r0, #0x18
cmp r3, #0x1
bls .Lc8
mov r3, #0x0
ldr r1, [pc, #0x34] @ =gCurTask
mov r10, r1
mov r7, r12
mov r2, #0x0
mov r6, r8
mov r4, r9
.Lf0:
lsl r1, r3, #0x3
add r0, r7, r1
str r2, [r0, #0x0]
add r1, r6, r1
str r2, [r1, #0x0]
lsl r0, r3, #0x1
add r0, r4, r0
strh r2, [r0, #0x0]
add r0, r3, #0x1
lsl r0, r0, #0x18
lsr r3, r0, #0x18
cmp r3, #0x3
bls .Lf0
mov r0, #0x0
strh r0, [r5, #0xa]
strh r0, [r5, #0xc]
strh r0, [r5, #0xe]
mov r1, r10
ldr r0, [r1, #0x0]
ldr r1, [pc, #0x30] @ =Task_80624E4
str r1, [r0, #0x8]
b .L15e
.word gCurTask
.word gStageData
.word #0x300005c
.word gUnknown_080D2044
.word #0xfffbffff
.word #0x3000010
.word #0x300003c
.word #0x3000040
.word #0x3000014
.word #0x300002c
.word #0x3000030
.word Task_80624E4
.L14c:
mov r0, r5
bl sub_8062580-0x4
cmp r0, #0x1
bne .L15e
ldr r0, [pc, #0x18] @ =gCurTask
ldr r0, [r0, #0x0]
bl TaskDestroy-0x4
.L15e:
add sp, #0x18
pop {r3, r4, r5}
mov r8, r3
mov r9, r4
mov r10, r5
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
```

# Declarations for the functions called from the target assembly

- `void m4aSongNumStart(u16);`
- `void m4aMPlayAllStop(void);`

# Types definitions used in the declarations

```c
typedef struct {
    // TODO: Is this a bool16?
    /* 0x00 */ s16 window;
    /* 0x02 */ s16 flags;

    // ((flags & 0x1) == TRANSITION_LIGHTEN) =>
    //   Q_8_8( 0) = Dark
    //   Q_8_8(32) = Light
    //
    // ((flags & 0x1) == TRANSITION_DARKEN) =>
    //   Q_8_8( 0) = Light
    //   Q_8_8(32) = Dark
    /* 0x04 */ s16 brightness;
    /* 0x06 */ s16 speed;
    /* 0x08 */ s16 bldCnt;
    /* 0x0A */ s16 bldAlpha;
} ScreenFade;
```

```c
typedef struct Hariisen {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u16 region[2];
    /* 0x10 */ u16 unkA;
    /* 0x10 */ u16 unkC[2];
    /* 0x10 */ u16 unk10[HSEN_COUNT_A];
    /* 0x14 */ u16 unk14[HSEN_COUNT_B];
    /* 0x1C */ Vec2_32 qUnk1C;
    /* 0x24 */ Vec2_32 qPos;
    /* 0x2C */ Vec2_32 qUnk2C[HSEN_COUNT_A];
    /* 0x3C */ Vec2_32 qUnk3C[HSEN_COUNT_B];
    /* 0x5C */ Sprite2 s;
    /* 0x8C */ Sprite2 s2;
    /* 0xBC */ Sprite2 s3;
} Hariisen;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u16 regionX;
    /* 0x06 */ u16 regionY;
#if (GAME == GAME_SA3)
    /* 0x08 */ u8 unk8;
    /* 0x09 */ u8 unk9;
#endif
    /* 0x0A */ u8 meX;
    /* 0x0B */ u8 id;
} SpriteBase;
```

```c
typedef struct {
    /* 0x00 */ s32 qWorldX;
    /* 0x04 */ s32 qWorldY;
    /* 0x08 */ s32 qWorldX2;
    /* 0x0C */ s32 qWorldY2;
    /* 0x10 */ s16 unk10;
    /* 0x12 */ s16 unk12;
    /* 0x14 */ s16 unk14;
    /* 0x16 */ u16 moveState; // see CMS values above!
    /* 0x18 */ u8 unk18;
    /* 0x19 */ u8 unk19;
    /* 0x1A */ u8 unk1A;
    /* 0x1B */ u8 unk1B;
    /* 0x1C */ u8 unk1C;
    /* 0x1D */ u8 unk1D;
    /* 0x1E */ u8 filler1E[0x2];
    /* 0x20 */ Sprite2 s;
    /* 0x50 */ Player *player;
    /* 0x54 */ Player *unk54;
} Cheese;
```

```c
typedef enum {
    SONIC, // 0
#if (GAME > GAME_SA1)
    CREAM, // 1
#endif
    TAILS, // 2
    KNUCKLES, // 3
    AMY, // 4
    PLAYERCHAR_COUNT, // 5
    PLAYERCHAR_NONE = 0xFF,
} eCharacter;
```

```c
typedef struct {
    u8 Act1 : 1;
    u8 Act2 : 1;
    u8 Act3 : 1;
    u8 Boss : 1;
    u8 BonusCapsule : 1;
    u8 BonusEnemies : 1;
    u8 Bit7 : 1;
} ZoneCompletion;
```

```c
typedef s16 CamCoord;
```

```c
typedef AnimCmdResult (*AnimationCommandFunc)(void *cursor, Sprite *sprite);
```

```c
typedef struct {
    s16 x;
    s16 y;
} Vec2_16;
```

```c
typedef struct DMATransfer {
    union {
        const void *src;
        const u16 *src16;
        const u32 *src32;
    };
    union {
        void *dst;
        vu16 *dst16;
        vu32 *dst32;
    };
    u32 size;
    u16 control;
} DMATransfer;
```

```c
typedef enum {
    CHARACTER_SONIC,
#if (GAME >= GAME_SA2)
    CHARACTER_CREAM,
#endif
    CHARACTER_TAILS,
    CHARACTER_KNUCKLES,
    CHARACTER_AMY,

    NUM_CHARACTERS
} ECharacters;
```

```c
typedef struct HariisenProj {
    /* 0x00 */ u8 unk0[HSEN_COUNT_A];
    /* 0x00 */ u8 unk2[HSEN_COUNT_B];
    /* 0x06 */ u16 region[2];
    /* 0x10 */ u16 unkA;
    /* 0x10 */ s32 unkC[HSEN_COUNT_A];
    /* 0x14 */ s32 unk14[HSEN_COUNT_B];
    /* 0x24 */ Vec2_32 qPos;
    /* 0x2C */ Vec2_32 qUnk2C[HSEN_COUNT_A];
    /* 0x3C */ Vec2_32 qUnk3C[HSEN_COUNT_B];
    /* 0x5C */ Sprite2 s;
    /* 0x8C */ Sprite2 s2;
} HariisenProj;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u16 regionX;
    /* 0x06 */ u16 regionY;
    /* 0x08 */ u16 unk8; // only in SA3
    /* 0x0A */ u8 meX;
    /* 0x0B */ u8 id;
} SpriteBase2;
```

```c
typedef struct {
    /* 0x00 */ u8 language; // @NOTE: unk0 and unk1 referenced as single u16 before; union?
    /* 0x01 */ u8 difficulty;
    /* 0x02 */ u8 unk2;
    /* 0x03 */ u8 gameMode; // (0x0: normal, 0x1: Demo, 0x2: ???, 0x3: Time Attack,
                            // x7: multiplayer?)
    /* 0x04 */ u8 unk4;
    /* 0x05 */ u8 unk5; // This appears to be flag with layout 0b01010101 (see IA goal_ring)
    /* 0x06 */ u8 playerIndex; // Index of the controlled Player in gPlayers[] | 0x2B
    /* 0x07 */ u8 unk7;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ u8 zone; // Currently visited Zone
    /* 0x0A */ u8 act; // Currently visited Act
    /* 0x0B */ u8 entryIndex; // Map entrance number index
    /* 0x0C */ u8 unkC;
    /* 0x0D */ u8 unkD;
    /* 0x0E */ u16 currMapIndex; // Map player's currently on
    /* 0x10 */ u16 unk10; // some kind of flag register

    /* 0x12 */ u16 nextMapIndex; // Map targeted by teleport (apparently only works with
                                 // level warps?)

    /* 0x14 */ ButtonConfig buttonConfig;

    /* 0x1C */ u32 timer;

    /* 0x20 */ u8 unk20;
    /* 0x21 */ u8 unk21;
    /* 0x22 */ u8 filler22[2];
    /* 0x24 */ u32 unk24;

    // Coordinates for start-position and
    // respawn after losing a life
    /* 0x28 */ u16 respawnX;
    /* 0x2A */ u16 respawnY;

    /* Timers
        The indices for the arrays (which are the bit number for each EnableBits value)
        are retrieved by finding the first bit set in me->d.uData[4].
    */
    /* 0x2C */ u8 platformTimerEnableBits;
    /* 0x2D */ u8 springTimerEnableBits;
    /* 0x2E */ u16 platformTimers[TIMER_ID_COUNT];
    /* 0x3E */ u16 springTimers[TIMER_ID_COUNT]; // TODO: Check name accuracy
    /* 0x4E */ u16 unk4E[TIMER_ID_COUNT];
    /* 0x5E */ s16 unk5E[TIMER_ID_COUNT];
    /* 0x6E */ u16 unk6E[TIMER_ID_COUNT];

    /* 0x7E */ u8 filler7E[0x2];
    /* 0x80 */ u16 *unk80; // (type not checked, used in sub_8002838) | 0x80
    /* 0x84 */ u8 unk84; // | 0x84
    /* 0x85 */ u8 unk85; // | 0x85
    /* 0x86 */ u8 unk86; // | 0x86
    /* 0x87 */ u8 flagSpKey; // SP-key-flag of current act | 0x87
    /* 0x88 */ u8 PADDING42[0x04];
    /* 0x8C */ u16 unk8C;
    /* 0x8E */ u8 unk8E; // PlayerIndex for Multiplayer?
    /* 0x8F */ u8 unk8F;
    /* 0x90 */ struct Task *task90;
    /* 0x94 */ u32 unk94;
    /* 0x98 */ struct Task *taskCheese; // -> Cheese *, set to NULL in TaskDestructor
    /* 0x9C */ struct Task *task9C; // -> AfterImages *
    /* 0xA0 */ u32 unkA0;
    /* 0xA4 */ u32 unkA4;
    /* 0xA8 */ u32 unkA8;
    /* 0xAC */ u16 rings;
    /* 0xAE */ u16 levelTimer; // Timer that constantly increases in a level
    /* 0xB0 */ u16 unkB0;
    /* 0xB2 */ u16 unkB2;
    /* 0xB4 */ u8 lives;
    /* 0xB5 */ u8 unkB5;
    /* 0xB6 */ u8 unkB6;
    /* 0xB7 */ u8 unkB7;
    /* 0xB8 */ u8 unkB8;
    /* 0xB9 */ u8 unkB9;
    /* 0xBA */ u8 unkBA;
    /* 0xBB */ u8 unkBB;
    /* 0xBC */ u8 unkBC; // bitfield
    /* 0xBD */ u8 unkBD;
    /* 0xBE */ u8 unkBE[7];
} StageData;
```

```c
typedef struct Player Player;
```

```c
typedef struct {
    u8 Bronze : 1;
    u8 Silver : 1;
    u8 Gold : 1;
} MedalCollection;
```

```c
typedef s16 CamCoord;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -2

    // Note(Jace): This needs to be signed, since a
    //             negative value infers that it's using 8bit-colors
    /* 0x04 */ s32 tileIndex;

    /* 0x08 */ u32 numTilesToCopy;
} ACmd_GetTiles;
```

```c
typedef struct {
    u16 x;
    u16 y;
} Vec2_u16;
```

```c
typedef enum { DMA_NOW, DMA_VBLANK, DMA_HBLANK, DMA_SPECIAL } DmaStartTypes;
```

```c
typedef struct Stack_806152C {
    Vec2_32 unk4;
    Vec2_16 unk8;
    u16 *unkC[2];
} Stack_806152C;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ s32 qWorldX;
    /* 0x08 */ s32 qWorldY;
    /* 0x0C */ u16 regionX;
    /* 0x0E */ u16 regionY;
    /* 0x10 */ u16 unk10;
    /* 0x12 */ s16 unk12;
    /* 0x14 */ u8 meX;
    /* 0x15 */ u8 id;
    /* 0x16 */ u8 unk16;
    /* 0x17 */ u8 unk17;
    /* 0x18 */ u8 unk18;
    /* 0x19 */ u8 unk19;
} SpriteBase3;
```

```c
typedef enum {
    ACT_TYPE_ACT_1 = 0x01,
    ACT_TYPE_ACT_2 = 0x02,
    ACT_TYPE_ACT_3 = 0x04,
    ACT_TYPE_BOSS = 0x08,
    ACT_TYPE_MINIGAME_CAPSULE = 0x10,
    ACT_TYPE_MINIGAME_ENEMIES = 0x20,
    ACT_TYPE_40 = 0x40,
    ACT_TYPE_80 = 0x80,
} eActType;
```

```c
typedef struct {
    /* 0x00 */ SpriteTransform tf;
    /* 0x0C */ Sprite2 s;
} PlayerSpriteInfo;
```

```c
typedef struct {
    /* 0x00 */ u32 playerId;
    /* 0x04 */ u16 playerName[MAX_PLAYER_NAME_LENGTH];

    /* 0x10 */ bool8 slotFilled;

    /* 0x11 */ u8 wins;
    /* 0x12 */ u8 losses;
    /* 0x13 */ u8 draws;
} VsRecords;
```

```c
typedef s32 CamCoord;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -2

    /* 0x04 */ s32 palId;
    /* 0x06 */ u16 numColors;
    /* 0x08 */ u16 insertOffset; // SA3: just a byte?
} ACmd_GetPalette;
```

```c
typedef struct {
    s32 x;
    s32 y;
} Vec2_32;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u16 regionX;
    /* 0x06 */ u16 regionY;
    /* 0x08 */ u8 filler8[0x2];
    /* 0x0A */ u16 qSpeedAirX; // only in SA3
    /* 0x0A */ u16 qSpeedAirY; // only in SA3
    /* 0x0E */ u8 meX;
    /* 0x0F */ u8 id;
} SpriteBase4;
```

```c
typedef struct PlayerUnkC4 {
    u32 unk0;
    s16 playerId;
} PlayerUnkC4;
```

```c
typedef struct {
    /* 0x00 */ u8 slotFilled;
    /* 0x01 */ u8 wins;
    /* 0x02 */ u8 draws;
    /* 0x03 */ u8 losses;
    /* 0x04 */ u32 playerId;
    /* 0x08 */ u16 playerName[MAX_PLAYER_NAME_LENGTH];
} VsRecords2;
```

```c
typedef s32 CamCoord;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -3

    /* 0x04 */ s32 offset;
} ACmd_JumpBack;
```

```c
typedef struct {
    u8 reserved : 4;
    u8 compressedType : 4;
    u32 size : 24;
    void *data;
} RLCompressed;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u16 regionX;
    /* 0x06 */ u16 regionY;
    /* 0x08 */ u8 meX;
    /* 0x09 */ u8 id;
    /* 0x0A */ u8 unkA;
    /* 0x0B */ u8 unkB;
} SpriteBase5;
```

```c
typedef struct PlayerUnk148_A {
    s16 unk0;
    s16 unk2;
    u8 unk4;
    u8 unk5;
    u8 unk6;
    u8 unk7;
    s16 unk8;
    u8 unkA;
    u8 unkB;
    s16 unkC;
} PlayerUnk148_A;
```

```c
typedef struct TimeRecords {
    u16 table[NUM_COURSE_ZONES][ACTS_PER_ZONE][TIME_RECORDS_PER_COURSE];
} TimeRecords;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -4
} ACmd_4;
```

```c
typedef struct {
    /* 0x00 */ u16 pa, pb, pc, pd;
    /* 0x08 */ u32 x, y;
} BgAffineReg;
```

```c
typedef struct {
    SpriteBase base;
    Sprite s;
} EnemyBase;
```

```c
typedef struct PlayerUnk148_B {
    s16 unk0;
    u8 unk2;
    u8 unk3;
    u8 unk4;
    u8 unk5;
    u8 unk6;
    u8 unk7;
    u8 unk8;
    u8 unk9;
    u8 unkA;
    u8 unkB;
    s16 unkC;
} PlayerUnk148_B;
```

```c
typedef struct TimeRecord {
    u8 character1; // 0x00 | Main Character
    u8 character2; // 0x01 | Partner Character
    u16 time; // 0x02 | Time; default: 36000 (= 1/60s * 60s * 10m)
} TimeRecord;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -5

    /* 0x04 */ u16 songId;
} ACmd_PlaySoundEffect;
```

```c
typedef bool32 (*VBlankFunc)(void);
```

```c
typedef struct PlayerUnk148_C {
    s16 unk0;
    u8 unk2;
    u8 unk3;
    u8 *tiles;
    u8 unk8;
    u8 unk9;
    u8 unkA;
    u8 unkB;
    s16 unkC;
} PlayerUnk148_C;
```

```c
typedef struct TimeRecords {
    TimeRecord table[NUM_COURSE_ZONES][4][5]; // [Zone][Act][Rank]
} TimeRecords;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -6

    /* 0x04 */ Hitbox hitbox;
} ACmd_Hitbox;
```

```c
typedef struct PlayerUnk148_D {
    u8 unk0[0x8];
    u16 unk8;
    s16 someAnim0;
    Sprite s;
} PlayerUnk148_D;
```

```c
typedef struct {
    /* 0x00 */ u32 playerId;
    /* 0x04 */ u16 playerName[MAX_PLAYER_NAME_LENGTH];
    /* 0x10 */ u8 unlockedCharacters; // 0x10 | Bitfield determining access to playable characters
    /* 0x11 */ u8 unlockedZones; // 0x11 | Up to the index of this value all Zones are
                                 // accessible (1 to 9)
    /* 0x12 */ u8 continueZone; // 0x12 | Zone the player continues at on startup after
                                // character select (0 to 6)
    /* 0x13 */ u8 unk13;
    /* 0x14 */ u16 chaoCount[NUM_COURSE_ZONES]; // 0x14 - 0x21 |
    /* 0x22 */ u8 specialKeys[NUM_COURSE_ZONES]; // 0x22 - 0x28 | Each counter counts for one Zone
    /* 0x29 */ u8 unlockedStages[9]; // 0x29-0x31 | (struct ZoneCompletion)
    /* 0x32 */ u8 collectedEmeralds; // 0x32 | Stored bitwise: x7654321b
    /* 0x33 */ u8 unlockFlags;
    /* 0x34 */ u16 unk34;
    /* 0x36 */ u8 unk36; /* Live count? */
    /* 0x37 */ u8 collectedMedals[9][4]; // 0x37 | (struct MedalCollection)
                                         // xxxxxGSBb Medals collected for
                                         // completion time in each [Zone][Act]
    /* 0x5B */ u8 unk5B;
    /* 0x5C */ u8 unk5C;
    /* 0x5D */ u8 unk5D;
    /* 0x5E */ u16 unk5E; // Unsure about type

    /* 0x60 */ u8 vsWins;
    /* 0x61 */ u8 vsLosses;
    /* 0x62 */ u8 vsDraws;
    /* 0x63 */ u8 unk63; // Vs???

    /* 0x64 */ VsRecords vsRecords[10]; // 0x64 | Records in Multiplayer Matches

    /* 0x12C */ TimeRecords timeRecords;
    /* 0x35C */ ButtonConfig buttonConfig;

    /* 0x364 */ u8 difficulty; // 0: Normal, 1: Easy
    /* 0x365 */ bool8 disableTimeLimit;
    /* 0x366 */ u8 language;
    /* 0x367 */ u8 unk367;
} SaveGame;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -7

    /* 0x04 */ u16 x;
    /* 0x06 */ u16 y;
} ACmd_TranslateSprite;
```

```c
typedef union PlayerUnk148 {
    PlayerUnk148_A a;
    PlayerUnk148_B b;
    PlayerUnk148_C c;
    PlayerUnk148_D d;
} PlayerUnk148;
```

```c
typedef struct SaveSectorHeader {
    /* 0x000 */ u32 magicNumber; // default: 0x47544E4C ("LNTG")
    /* 0x004 */ u32 sectorId;
} SaveSectorHeader;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -8

    /* 0x04 */ s32 unk4;
    /* 0x08 */ s32 unk8;
} ACmd_8;
```

```c
typedef struct Struc_3001150 {
    u8 filler0[0x1C];
    u8 filler1C[0x4];
    u8 filler20[0x450];
} Struc_3001150;
```

```c
typedef struct {
    SaveSectorHeader header;

    // @NOTE This contains mostly the same information as struc_3000530, but
    // some values are missing or in a different order.
    /* 0x008 */ u32 playerId; // | 0x08
    /* 0x00C */ u16 playerName[MAX_PLAYER_NAME_LENGTH];
    /* 0x018 */ u8 unk18; // Don't know why this byte is here, but it's correct

    /* 0x019 */ u8 unlockedCharacters; // 0x19 |
    /* 0x01A */ u8 unlockedZones; // 0x1A |
    /* 0x01B */ u8 continueZone; // 0x1B | Zone the player continues at on startup after character
                                 // select (0 to 6)
    /* 0x01C */ u8 unk1C;

    /* 0x01D */ u16 chaoCount[7]; // | v1D - 0x2B
    /* 0x02C */ u8 specialKeys[7]; // Each counter counts for 1 Act | 0x2C - 0x32
    /* 0x033 */ u8 unlockedStages[9]; // | 0x33-0x3B
    /* 0x03C */ u8 collectedEmeralds; // Stored bitwise: x7654321b | 0x3C

    // NOTE: These are different from
    //       struct struc_3000530, why?
    /* 0x03D */ u8 unlockFlags;
    /* 0x03E */ u8 collectedMedals[9][4];
    /* 0x062 */ u16 unk62; // v34?: struc_3000530
    /* 0x064 */ u8 vsWins; // v60?: struc_3000530
    /* 0x065 */ u8 vsDraws;
    /* 0x066 */ u8 vsLosses;
    u8 unk67;

    VsRecords2 vsRecords[10]; // 0x68

    /* 0x130 */ TimeRecords timeRecords; // 0x130

    /* 0x360 */ ButtonConfigPacked buttonConfig;
    /* 0x364 */ u8 difficulty;
    /* 0x365 */ bool8 disableTimeLimit;
    /* 0x366 */ u8 language;
    /* 0x367 */ u8 unk367; // INVESTIGATE: v367 might be unused.

    /* 0x368 */ u32 checksum;
} SaveSectorData;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -9

    /* 0x04 */ AnimId animId;
    /* 0x06 */ u16 variant;
} ACmd_SetIdAndVariant;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -10

    /* 0x04 */ s32 unk4;
    /* 0x08 */ s32 unk8;
    /* 0x0C */ s32 unkC;
} ACmd_10;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -11

    /* 0x04 */ s32 priority;
} ACmd_SetSpritePriority;
```

```c
typedef struct {
    /* 0x00 */ s32 cmdId; // -12

    /* 0x04 */ s32 orderIndex;
} ACmd_SetOamOrder;
```

```c
typedef struct {
    // number of frames this will be displayed
    s32 delay;

    // frameId of this animation that should be displayed
    s32 index;
} ACmd_ShowFrame;
```

```c
typedef union {
    s32 id;

    ACmd_GetTiles tiles;
    ACmd_GetPalette pal;
    ACmd_JumpBack jump;
    ACmd_4 end;
    ACmd_PlaySoundEffect sfx;
    ACmd_Hitbox _6;
    ACmd_TranslateSprite translate;
    ACmd_8 _8;
    ACmd_SetIdAndVariant setAnimId;
    ACmd_10 _10;
    ACmd_SetSpritePriority _11;
    ACmd_SetOamOrder setOamOrder;

    ACmd_ShowFrame show;
} ACmd;
```

```c
typedef struct SaveManager {
    VoidFn func;
    u16 color;
    u8 unk6;
} SaveManager;
```

```c
typedef bool32 (*VBlankProcessFunc)(void);
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 unk7;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ s8 unk9;
    /* 0x0A */ u8 unkA;
    /* 0x0C */ u16 region[2];
    /* 0x10 */ u8 unk10;
    /* 0x12 */ s16 unk12;
    /* 0x14 */ Vec2_32 qUnk14;
    /* 0x1C */ Vec2_32 qPos;
    /* 0x24 */ s32 qLeft;
    /* 0x28 */ s32 qRight;
    /* 0x2C */ Sprite s;
    /* 0x54 */ u8 filler54[4];
    /* 0x58 */ u16 unk58[2]; // TODO: type
} GekoGeko;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 unk4;
    /* 0x05 */ u8 unk5;
    /* 0x06 */ u8 id;
    /* 0x07 */ u8 meX;
    /* 0x08 */ bool8 unk8;
    /* 0x09 */ u8 unk9;
    /* 0x0A */ s8 direction;
    /* 0x0C */ u16 region[2];
    /* 0x10 */ u16 rotation;
    /* 0x12 */ s16 timer;
    /* 0x14 */ s32 speed;
    /* 0x18 */ s32 unk18;
    /* 0x1C */ Vec2_32 qUnk1C;
    /* 0x24 */ Vec2_32 qPos;
    /* 0x2C */ SpriteTransform transform;
    /* 0x38 */ Sprite s;
    /* 0x60 */ Hitbox reserved;
} Marun;
```

```c
typedef struct Yukigasen {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 cooldown;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ s8 unk8;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u8 fillerE[0x2];
    /* 0x10 */ Vec2_32 qSpawn;
    /* 0x18 */ Vec2_32 qPos;
    /* 0x20 */ Sprite2 s;
} Yukigasen;
```

```c
typedef struct YukigasYukigasenSnowballen {
    /* 0x00 */ s8 unk0;
    /* 0x01 */ s8 unk1;
    /* 0x02 */ s8 unk2;
    /* 0x03 */ s8 unk3;
    /* 0x04 */ u16 unk4;
    /* 0x06 */ u16 unk6;
    /* 0x08 */ s16 unk8;
    /* 0x0A */ s16 unkA;
    /* 0x0C */ s16 unkC;
    /* 0x0E */ u8 fillerE[0x2];
    /* 0x10 */ Vec2_32 qWorldPos;
    /* 0x18 */ Sprite2 s;
} YukigasenSnowball;
```

```c
typedef struct GuardState {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 mePos[2];
    /* 0x06 */ u8 unk6;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ u8 unk9;
    /* 0x0A */ u8 unkA;
    /* 0x0B */ u8 unkB;
    /* 0x0C */ u8 unkC;
    /* 0x0D */ u8 unkD;
    /* 0x0E */ u8 id;
    /* 0x0F */ u8 meX;
    /* 0x10 */ u16 region[2];
} GuardState;
```

```c
typedef struct Guard {
    /* 0x00 */ u8 *mePos;
    /* 0x04 */ u8 meX;
    /* 0x05 */ u8 unk5;
    /* 0x06 */ u8 mePosX;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ u8 unk9;
    /* 0x09 */ s8 dir;
    /* 0x0A */ u8 fillerB[1];
    /* 0x0C */ u16 region[2];
    /* 0x10 */ u8 unk10;
    /* 0x14 */ u8 *unk14;
    /* 0x18 */ Vec2_32 unk18;
    /* 0x20 */ Vec2_32 unk20;
    /* 0x28 */ Vec2_32 unk28;
    /* 0x30 */ Sprite2 s;
} Guard;
```

```c
typedef struct GuardProj {
    /* 0x00 */ s8 unk0;
    /* 0x01 */ s8 dir;
    /* 0x02 */ s8 unk2;
    /* 0x03 */ s8 unk3;
    /* 0x04 */ u16 region[2];
    /* 0x08 */ s16 unk8;
    /* 0x0A */ s16 unkA;
    /* 0x0C */ s16 unkC;
    /* 0x10 */ Vec2_32 qPos;
    /* 0x18 */ Sprite2 s;
} GuardProj;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u16 unk6;
    /* 0x08 */ u16 unk8;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ s8 direction;
    /* 0x0F */ u8 unkF;
    /* 0x10 */ s32 qUnk10;
    /* 0x14 */ s32 qUnk14;
    /* 0x18 */ s32 qUnk18;
    /* 0x1C */ s32 qUnk1C;
    /* 0x20 */ Vec2_32 qPos;
    /* 0x28 */ Vec2_32 qUnk28;
    /* 0x30 */ Sprite s;
    /* 0x58 */ Hitbox reserved;
} Jousun;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ s8 direction;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE;
    /* 0x10 */ u16 unk10;
    /* 0x12 */ u16 unk12;
    /* 0x14 */ Vec2_32 qUnk14;
    /* 0x1C */ Vec2_32 qPos;
    /* 0x24 */ s32 qLeft;
    /* 0x24 */ s32 qRight;
    /* 0x2C */ Sprite2 s;
} BuBu /* size: 0x5C */;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ s8 unk6;
    /* 0x07 */ s8 unk7;
    /* 0x08 */ u16 region[2];
    /* 0x0C */ u16 unkC;
    /* 0x0E */ u16 unkE;
    /* 0x10 */ Vec2_32 qUnk10;
    /* 0x18 */ Vec2_32 qPos;
    /* 0x20 */ Vec2_32 qUnk20;
    /* 0x28 */ Sprite s;
    /* 0x50 */ Sprite s2;
    /* 0x78 */ u8 filler78[0x4];
    /* 0x7C */ u8 unk7C[0x4];
} Minimole;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 unk7;
    /* 0x08 */ s8 direction;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ s16 unkE;
    /* 0x10 */ Vec2_32 qUnk10;
    /* 0x18 */ Vec2_32 qPos;
    /* 0x20 */ s32 qLeft;
    /* 0x24 */ s32 qRight;
    /* 0x28 */ Sprite s;
    /* 0x50 */ Hitbox reserved; // TODO: Check type!
} Yadokk;
```

```c
typedef struct {
    /* 0x00 */ u16 qUnk0;
    /* 0x02 */ u16 region[2];
    /* 0x06 */ u16 unk6;
    /* 0x08 */ u16 unk8;
    /* 0x04 */ Vec2_32 qPos;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Hitbox reserved;
} YadokkProjectile;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ s8 unk6;
    /* 0x07 */ s8 direction;
    /* 0x08 */ u16 region[2];
    /* 0x0C */ Vec2_32 qUnkC;
    /* 0x14 */ Vec2_32 qPos;
    /* 0x1C */ s32 unk1C;
    /* 0x20 */ s32 unk20;
    /* 0x24 */ Sprite s;
    /* 0x4C */ u8 filler4C[0x4];
    /* 0x50 */ u16 unk50[2]; // TODO: type
} Akatento;
```

```c
typedef enum UutsuboType {
    MKTYPE_A,
    MKTYPE_B,
} UutsuboType;
```

```c
typedef struct Muukaden {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ s8 dir;
    /* 0x07 */ u16 unkA[5];
    /* 0x14 */ u16 region[2];
    /* 0x18 */ u16 unk18;
    /* 0x1A */ u16 unk1A;
    /* 0x2C */ Vec2_32 qUnk1C;
    /* 0x24 */ s32 qLeft;
    /* 0x28 */ s32 qRight;
    /* 0x2C */ Vec2_32 qUnk2C;
    /* 0x34 */ s32 qTop;
    /* 0x38 */ s32 qBottom;
    /* 0x3C */ Vec2_32 qUnk3C[4];
    /* 0x5C */ Vec2_32 qUnk5C;
    /* 0x64 */ Vec2_32 qPos;
    /* 0x6C */ SpriteTransform tf;
    /* 0x78 */ Sprite2 sprites[5];
} Muukaden;
```

```c
typedef struct Juggling {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6[2];
    /* 0x08 */ s8 unk8;
    /* 0x09 */ s8 unk9;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE[2];
    /* 0x12 */ s16 unk12;
    /* 0x14 */ void *vram;
    /* 0x18 */ s32 unkX;
    /* 0x1C */ s32 unkY;
    /* 0x20 */ Vec2_32 qPos;
    /* 0x28 */ Vec2_32 unk28[2];
    /* 0x38 */ u8 filler38[0x4];
    /* 0x3C */ s32 unk3C;
    /* 0x40 */ s32 unk40;
    /* 0x44 */ Sprite2 s;
    /* 0x74 */ Sprite2 s2;
    /* 0xA4 */ Sprite2 s3;
    /* 0xD4 */ struct Task *unkD4;
    /* 0xD8 */ struct Task *unkD8;
} Juggling;
```

```c
typedef struct JugglingPin {
    /* 0x00 */ u8 unk0;
    /* 0x00 */ u8 *unk4;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ u8 unk9;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE;
    /* 0x10 */ u16 unk10;
    /* 0x12 */ u16 unk12;
    /* 0x14 */ void *vram;
    /* 0x14 */ s32 *unk18;
    /* 0x14 */ s32 *unk1C;
    /* 0x20 */ Vec2_32 qPos;
    /* 0x28 */ Sprite2 s;
} JugglingPin;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 unk7;
    /* 0x08 */ s8 direction;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ s16 unkE;
    /* 0x10 */ Vec2_32 qUnk10;
    /* 0x18 */ Vec2_32 qPos;
    /* 0x20 */ s32 qLeft;
    /* 0x24 */ s32 qRight;
    /* 0x28 */ Sprite s;
    /* 0x50 */ Hitbox reserved; // TODO: Check type!
} Ginpe;
```

```c
typedef struct {
    /* 0x00 */ u8 unk0;
    /* 0x01 */ s8 unk1;
    /* 0x02 */ s8 unk2;
    /* 0x04 */ u16 region[2];
    /* 0x08 */ u16 unk8;
    /* 0x0A */ u16 unkA;
    /* 0x0C */ s16 unkC;
    /* 0x10 */ Vec2_32 qPos;
    /* 0x18 */ Sprite s;
    /* 0x40 */ Hitbox reserved;
} GinpeProjectile;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 direction;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ u8 unk9;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE;
    /* 0x10 */ Vec2_32 qUnk10;
    /* 0x18 */ Vec2_32 qPos;
    /* 0x20 */ s32 qLeft;
    /* 0x24 */ s32 qRight;
    /* 0x28 */ Sprite s;
    /* 0x50 */ Hitbox reserved;
} Buzzer;
```

```c
typedef struct {
    /* 0x00 */ u16 region[2];
    /* 0x04 */ u16 theta;
    u8 filler4[0x2];
    /* 0x08 */ Vec2_32 qUnk8;
    /* 0x10 */ Vec2_32 qPos;
    /* 0x18 */ Sprite s;
    /* 0x40 */ Hitbox reserved;
} BuzzerProjectile;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 direction;
    /* 0x08 */ u16 unk8[5]; // TODO: check size, 4 or 5?
    /* 0x12 */ u16 region[2];
    /* 0x18 */ s32 qLeft;
    /* 0x1C */ s32 qRight;
    /* 0x20 */ Vec2_32 qUnk20[NUM_SEGMENT_SPRITES];
    /* 0x40 */ Vec2_32 qUnk40;
    /* 0x48 */ Vec2_32 qPos;
    /* 0x50 */ Sprite2 s[NUM_SPRITES];
} GuruGuru;
```

```c
typedef struct {
    /* 0x00 */ u8 unk0;
    /* 0x01 */ s8 unk1;
    /* 0x02 */ s8 unk2;
    /* 0x04 */ u16 region[2];
    /* 0x08 */ u16 unk8;
    /* 0x0A */ u16 unkA;
    /* 0x0C */ s16 unkC;
    /* 0x10 */ Vec2_32 qPos;
    /* 0x18 */ Sprite s;
    /* 0x40 */ Hitbox reserved;
} GuruGuruProjectile;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 direction;
    /* 0x08 */ u16 unk8;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE;
    /* 0x10 */ s32 unk10;
    /* 0x14 */ Vec2_32 qUnk14;
    /* 0x1C */ Vec2_32 qPos;
    /* 0x24 */ Sprite s;
    /* 0x4C */ Sprite s2;
    /* 0x54 */ Hitbox reserved;
} Ape;
```

```c
typedef struct {
    /* 0x00 */ u8 unk0;
    /* 0x01 */ s8 unk1;
    /* 0x02 */ s8 unk2;
    /* 0x03 */ u8 unk3;
    /* 0x04 */ u16 region[2];
    /* 0x08 */ u16 unk8;
    /* 0x0A */ u16 unkA;
    /* 0x0C */ u16 unkC;
    /* 0x0E */ u16 unkE;
    /* 0x10 */ Vec2_32 qPos;
    /* 0x18 */ Sprite s;
    /* 0x40 */ Hitbox reserved;
} ApeProjectile;
```

```c
typedef struct Clam {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 unk4;
    /* 0x05 */ u8 id;
    /* 0x06 */ u8 meX;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ s8 unk8;
    /* 0x09 */ s8 direction;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ s16 unkE;
    /* 0x10 */ Vec2_32 qUnk10;
    /* 0x18 */ Vec2_32 qPos;
    /* 0x20 */ Sprite2 s;
} Clam;
```

```c
typedef struct ClamProj {
    /* 0x00 */ u8 unk0;
    /* 0x01 */ u8 unk1;
    /* 0x02 */ u16 region[2];
    /* 0x06 */ u8 filler6[0x2];
    /* 0x08 */ s32 unk8;
    /* 0x0C */ Vec2_32 qPos;
    /* 0x14 */ s32 unk14;
    /* 0x18 */ s32 unk18;
    /* 0x1C */ Sprite2 s;
} ClamProj;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 unk7;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ s8 direction;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE;
    /* 0x10 */ u16 unk10;
    /* 0x14 */ Vec2_32 qUnk14;
    /* 0x1C */ Vec2_32 qPos;
    /* 0x24 */ s32 qLeft;
    /* 0x28 */ s32 qRight;
    /* 0x2C */ Sprite s;
    /* 0x44 */ u8 filler44[0x4];
    /* 0x50 */ u16 unk50[2]; // TODO: type
} Aotento;
```

```c
typedef enum ERingSpeedFactor {
    RSF_0,
    RSF_1,
    RSF_2,
    RSF_3,
    RSF_4,

    RSF_COUNT
} ERingSpeedFactor;
```

```c
typedef struct {
    AnimId anim;
    u16 variant;
} TileInfoShield;
```

```c
typedef struct Strc_800FF68 {
    /* 0x00 */ s32 qWorldX;
    /* 0x04 */ s32 qWorldY;
    /* 0x08 */ s16 unk8;
    /* 0x0A */ u16 unkA;
    /* 0x0C */ u8 fillerC[0x4];
    /* 0x10 */ Player *p;
    /* 0x14 */ Sprite s;
} Strc_800FF68;
```

```c
typedef struct Strc_PlayerStrc2C {
    /* 0x00 */ Sprite s;
    /* 0x28 */ s16 unk28;
    /* 0x2A */ s16 unk2A;
} Strc_PlayerStrc2C;
```

```c
typedef struct Strc_PlayerStrc2C_2 {
    /* 0x00 */ Sprite s;
    /* 0x28 */ Player *p;
} Strc_PlayerStrc2C_2;
```

```c
typedef struct Strc_PlayerStrc30 {
    /* 0x00 */ Sprite s;
    /* 0x28 */ Player *p;
    /* 0x2C */ s16 someY;
} Strc_PlayerStrc30;
```

```c
typedef struct Strc_PlayerStrc30_2 {
    /* 0x00 */ Sprite s;
    /* 0x2C */ s16 someY;
    /* 0x28 */ Player *p;
} Strc_PlayerStrc30_2;
```

```c
typedef struct Strc_PlayerStrc50 {
    /* 0x00 */ Sprite s;
    /* 0x28 */ Player *p;
    /* 0x2C */ s8 unk2C;
    /* 0x2D */ s8 unk2D;
    /* 0x2E */ s16 unk2E[8][2];
} Strc_PlayerStrc50;
```

```c
typedef struct PlayerStrcCC_Sprite {
    Sprite s;
    u8 unk28;
    u8 filler29[0x1];
    s16 worldX;
    s16 worldY;
    u8 filler2E[0x2];
} PlayerStrcCC_Sprite;
```

```c
typedef struct Strc_PlayerStrcCC {
    /* 0x00 */ u8 *vram;
    /* 0x04 */ s16 unk4;
    /* 0x06 */ s16 unk6;
    /* 0x08 */ Player *p;
    /* 0x0C */ PlayerStrcCC_Sprite sprites[4];
    /* 0xA8 */
} Strc_PlayerStrcCC;
```

```c
typedef struct Strc_PlayerUnkE0 {
    /* 0x00 */ void *vram;
    /* 0x04 */ Sprite s;
    /* 0x2C */ Sprite s2;
    /* 0x54 */ Vec2_16 unk54[10];
    /* 0x7C */ s16 unk7C;
    /* 0x7E */ s16 unk7E;
    /* 0x84 */ s16 unk80[12][2];
    /* 0xB4 */ s16 unkB0[12][2];
} Strc_PlayerUnkE0;
```

```c
typedef struct AfterImages {
    /* 0x00 */ SpriteTransform tf;
    /* 0x0C */ Sprite2 s;
    /* 0x3C */ u8 unk3C;
    /* 0x3C */ u8 filler3D[3];
} AfterImages;
```

```c
typedef struct SomeSubStruct_3001BF0 {
    /* 0x00 */ s32 qWorldX;
    /* 0x04 */ s32 qWorldY;
    /* 0x08 */ u32 frameFlags;
    /* 0x0C */ u32 moveState;
    /* 0x10 */ s16 anim2;
    /* 0x12 */ s16 rotation;
    /* 0x14 */ s8 state1;
    /* 0x15 */ s8 animSpeed;
} SomeSubStruct_3001BF0;
```

```c
typedef struct Strc_03001BF0 {
    SomeSubStruct_3001BF0 unk0[8];
    Player *unkC0;
    u8 index;
} Strc_03001BF0;
```

```c
typedef struct Strc_03001CF0 {
    u8 unk0;
    u8 filler1[3];
    u8 unk4;
    u16 unk6;
} Strc_03001CF0;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 direction;
    /* 0x08 */ Vec2_u16 region;
    /* 0x0C */ Vec2_32 qUnkC;
    /* 0x14 */ Vec2_32 qPos;
    /* 0x1C */ s32 unk1C;
    /* 0x20 */ s32 unk20;
    /* 0x24 */ Sprite s;
    /* 0x4C */ u8 filler4C[0x4];
    /* 0x50 */ u16 unk50[2]; // TODO: type
} Takkon;
```

```c
typedef struct {
    /* 0x00 */ Vec2_u16 region;
    /* 0x04 */ Vec2_32 qPos;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Hitbox reserved;
} TakkonProjectile;
```

```c
typedef struct Kamaki {
    /* 0x00 */ MapEntity *me;
    /* 0x08 */ u8 unk4;
    /* 0x05 */ u8 id;
    /* 0x06 */ u8 meX;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ s8 dir;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE[2];
    /* 0x12 */ s16 unk12;
    /* 0x14 */ Vec2_32 qUnk;
    /* 0x1C */ Vec2_32 qPos;
    /* 0x24 */ s32 qLeft;
    /* 0x28 */ s32 qRight;
    /* 0x2C */ Sprite2 s;
} Kamaki;
```

```c
typedef struct KamakiProj {
    /* 0x00 */ u8 unk0;
    /* 0x01 */ u8 unk1;
    /* 0x0A */ u16 region[2];
    /* 0x08 */ u16 rotations[NUM_PROJECTILES];
    /* 0x0A */ s16 unkA;
    /* 0x0C */ s16 unkC;
    /* 0x0E */ u16 unkE;
    /* 0x10 */ Vec2_32 qUnk10[NUM_PROJECTILES];
    /* 0x20 */ SpriteTransform tf[NUM_PROJECTILES];
    /* 0x34 */ Sprite2 s[NUM_PROJECTILES];
} KamakiProj;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ s8 unk6;
    /* 0x07 */ s8 unk7;
    /* 0x08 */ u16 region[2];
    /* 0x0C */ s32 unkC;
    /* 0x10 */ s32 unk10;
    /* 0x14 */ Vec2_32 qPos;
    /* 0x1C */ s32 unk1C;
    /* 0x20 */ s32 unk20;
    /* 0x24 */ Sprite s;
    /* 0x4C */ u8 filler4C[0x4];
    /* 0x50 */ u16 unk50[2]; // TODO: type
} GaoGao;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ u16 unk8;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ s8 direction;
    /* 0x0F */ u8 unkF;
    /* 0x18 */ s32 qUnk10;
    /* 0x1C */ s32 qUnk14;
    /* 0x18 */ s32 qUnk18;
    /* 0x1C */ s32 qUnk1C;
    /* 0x20 */ Vec2_32 qUnk20;
    /* 0x28 */ Vec2_32 qPos;
    /* 0x30 */ s32 qLeft;
    /* 0x34 */ s32 qRight;
    /* 0x38 */ Sprite s;
    /* 0x60 */ Hitbox reserved;
} Condor;
```

```c
typedef struct {
    /* 0x00 */ u16 region[2];
    /* 0x04 */ Vec2_32 qPos;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Hitbox reserved;
} CondorProjectile;
```

```c
typedef struct {
    // TODO: This resembles struct SpriteBase,
    //       but it is not the same (id / meX).
    //       SpriteBase gets used by IA 060 with the SA1/SA2 layout,
    //       so it might be specifically for enemies?
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u16 regionX;
    /* 0x08 */ u16 regionY;

    /* 0x0C */ s32 unkX;
    /* 0x10 */ s32 unkY;
    /* 0x14 */ s32 posX;
    /* 0x18 */ s32 posY;
    /* 0x1C */ Sprite s;
    /* 0x44 */ Hitbox reserved;
} Spinner;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ s8 direction;
    /* 0x08 */ u16 region[2];
    /* 0x0C */ s16 unkC;
    /* 0x10 */ Vec2_32 qUnk10;
    /* 0x18 */ Vec2_32 qUnk18;
    /* 0x20 */ Vec2_32 qPos;
    /* 0x28 */ u32 unk28;
    /* 0x2C */ s32 upperBound;
    /* 0x30 */ s32 lowerBound;
    /* 0x38 */ Sprite s;
    /* 0x60 */ Sprite s2;
    /* 0x88 */ Hitbox reserved;
} Kyacchaa;
```

```c
typedef enum UutsuboType {
    UUTYPE_A,
    UUTYPE_B,
    UUTYPE_C,
    UUTYPE_D,
} UutsuboType;
```

```c
typedef struct Uutsubo {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 meX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ u16 unk8[NUM_BODY_SEGMENTS];
    /* 0x12 */ u16 region[2];
    /* 0x12 */ u16 unk16[2];
    /* 0x1A */ u16 unk1A[NUM_BODY_SEGMENTS];
    /* 0x24 */ u16 unk24;
    /* 0x26 */ u8 filler26[0x2];
    /* 0x60 */ Vec2_32 qUnk28;
    /* 0x30 */ Vec2_32 qBodyPositions[NUM_BODY_SEGMENTS];
    /* 0x58 */ Vec2_32 qHeadPos;
    /* 0x60 */ Vec2_32 qPos;
    /* 0x68 */ SpriteTransform tf;
    /* 0x74 */ Sprite2 s;
    /* 0xA4 */ Sprite2 s2;
} Uutsubo;
```

```c
typedef struct Stack_805D47C {
    Vec2_32 sp0;
    Vec2_32 sp8;
    s32 result;
} Stack_805D47C;
```

```c
typedef struct CharacterSelect {
    /* 0x00 */ u8 unk0;
    /* 0x01 */ u8 unk1;
    /* 0x02 */ u8 unk2;
    /* 0x03 */ u8 unk3;
    /* 0x04 */ u8 unk4;
    /* 0x05 */ u8 unk5;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ u8 createIndex;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ u8 unk9;
    /* 0x09 */ u8 language;
    /* 0x0B */ u8 unkB;
    /* 0x0C */ u8 unkC[2];
    /* 0x0E */ u16 unkE;
    /* 0x10 */ u16 qFadeBrightness;
    /* 0x12 */ u16 unk12;
    /* 0x14 */ u16 unk14;
    /* 0x16 */ s16 qUnk16;
    /* 0x18 */ s16 qUnk18;
    /* 0x1A */ u8 filler1A[0x2];
    /* 0x1C */ void *unk1C;
    /* 0x20 */ s32 unk20;
    /* 0x24 */ s32 qUnk24;
    /* 0x28 */ s32 qUnk28;
    /* 0x2C */ s32 qUnk2C;
    /* 0x30 */ s32 qUnk30;
    /* 0x34 */ s32 qUnk34;
    /* 0x38 */ s32 qUnk38;
    /* 0x3C */ s32 qUnk3C;
    /* 0x40 */ s32 qUnk40;
    /* 0x44 */ s32 qUnk44;
    /* 0x48 */ s32 qUnk48;
    /* 0x4C */ s32 qUnk4C;
    /* 0x50 */ s32 qUnk50;
    /* 0x54 */ s32 qUnk54;
    /* 0x58 */ s32 qUnk58;
    /* 0x5C */ s32 qUnk5C;
    /* 0x60 */ s32 qUnk60;
    /* 0x64 */ s32 qUnk64;
    /* 0x68 */ s32 qUnk68;
    /* 0x6C */ s32 qUnk6C;
    /* 0x70 */ s32 qUnk70;
    /* 0x74 */ Sprite spr74;
    /* 0x9C */ Sprite spr9C;
    /* 0xC4 */ Sprite sprC4;
    /* 0xEC */ Sprite sprEC;
    /* 0x114 */ Sprite spr114;
    /* 0x13C */ Sprite spr13C;
    /* 0x164 */ Sprite spr164;
    /* 0x18C */ Sprite spr18C;
    /* 0x1B4 */ Background bg1B4;
    /* 0x1F4 */ Background bg1F4;
    /* 0x234 */ Background bg234;
} CharacterSelect;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Hitbox reserved;
    /* 0x3C */ s32 qWorldX;
    /* 0x40 */ s32 qWorldY;
    /* 0x44 */ u16 unused44;
    /* 0x46 */ u16 unused46;
    /* 0x48 */ u16 speedup;
    /* 0x4A */ u16 timeAlive;
    /* 0x4C */ u8 hasLED;
} DeathCrusher;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u16 regionX;
    /* 0x06 */ u16 regionY;
    /* 0x08 */ u8 unk8; // only in SA3
    /* 0x09 */ u8 unk9; // only in SA3
    /* 0x0A */ u8 unkA;
    /* 0x0B */ u8 meX;
    /* 0x0C */ u8 id;
    /* 0x10 */ Sprite s;
    /* 0x38 */ s32 qWorldX;
    /* 0x3C */ s32 qWorldY;
    /* 0x40 */ s16 unk40;
    /* 0x42 */ u16 unk42;
    /* 0x44 */ Vec2_16 world; // TODO: Rename to 'start' ?
    /* 0x48 */ Vec2_16 destination;
} UfoPlatform;
```

```c
typedef struct {
    s16 dx;
    s16 dy;
    Sprite s;
} PendSprite;
```

```c
typedef struct {
    /* 0x000 */ SpriteBase base;
    /* 0x00C */ PendSprite sprBalls[BALLS_PER_PEND * PEND_COUNT];
    /* 0x064 */ PendSprite sprSegments[SEGMENTS_PER_PEND * PEND_COUNT];
    /* 0x16C */ u16 activePend;
    /* 0x16E */ s16 qSwingPos[PEND_COUNT]; // -Q(24./256.) to -Q(1)
    /* 0x172 */ s16 swingForce[PEND_COUNT]; // grows/shrinks by 2 if the associated pend is active
    /* 0x178 */ void *tiles;
    /* 0x17C */ s32 worldX;
    /* 0x180 */ s32 worldY;
} Pendulum;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase2 base;
    /* 0x0C */ Sprite sprites[2];
    /* 0x5C */ u8 *unk5C; // points to a single byte, not an array
    /* 0x60 */ s16 unk60;
    /* 0x64 */ s32 worldX;
    /* 0x68 */ s32 worldY;
} GoalRingImpl;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 isXFlipped;
    /* 0x35 */ u8 unk35;
    /* 0x36 */ u8 unk36;
    /* 0x37 */ u8 unk37;
    /* 0x38 */ Player *activePlayer;
} BouncyBar;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s32 qWorldX;
    /* 0x38 */ s32 qWorldY;
    /* 0x3C */ u16 unk3C;
    /* 0x3E */ u16 theta;
    /* 0x40 */ u8 unk40;
    /* 0x41 */ u8 sharedKind;
    /* 0x42 */ u8 timerId;
    /* 0x43 */ bool8 isActive;
} ButtonPlatform;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 filler34[0x8];
    /* 0x3C */ u16 unk3C;
    /* 0x3E */ s16 worldX;
    /* 0x40 */ s16 worldY;
    /* 0x42 */ u8 unk42;
} IceLauncher;
```

```c
typedef struct {
    /* 0x00 */ s32 qWorldX;
    /* 0x04 */ s32 qWorldY;
    /* 0x08 */ s16 unk8;
    /* 0x0A */ s16 unkA;
    /* 0x0C */ u16 unkC;
    /* 0x0E */ u8 unkE;
    /* 0x0F */ u8 unkF;
    /* 0x10 */ Sprite s;
} IceShiver;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase5 base;
    /* 0x0C */ u16 unkC;
    /* 0x10 */ s32 qWorldX;
    /* 0x14 */ s32 qWorldY;
    /* 0x18 */ s16 worldX;
    /* 0x1A */ s16 worldY;
    /* 0x1C */ s32 qTop;
    /* 0x20 */ Vec2_16 qStarSpeeds[16];
    /* 0x60 */ Vec2_32 qStarWorldPos[16];
    /* 0xE0 */ Player *players[NUM_SINGLE_PLAYER_CHARS];
    /* 0xE8 */ Sprite sprites[4];
} Rocket;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Hitbox reserved;
    /* 0x3C */ Sprite s2;
    /* 0x64 */ u8 filler64[0x8];
    /* 0x6C */ s32 qWorldX;
    /* 0x70 */ s32 qWorldY;
    /* 0x74 */ s32 qHookWorldX;
    /* 0x78 */ s32 qHookWorldY;
    /* 0x7C */ s16 unk7C;
    /* 0x7E */ s16 qRadius;
    /* 0x80 */ u16 angle;
} PlatformAttached;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ u8 fillerC[0x4];
} IA_060;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s16 worldX;
    /* 0x0E */ s16 worldY;
    /* 0x10 */ u8 unk10;
    /* 0x11 */ u8 unk11[NUM_SINGLE_PLAYER_CHARS];
} IA_134;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ SpriteTransform transform;
    /* 0x40 */ Sprite s2;
    /* 0x68 */ void *tiles;
    /* 0x6C */ s16 worldX;
    /* 0x6E */ s16 worldY;
    /* 0x70 */ u8 rotation;
    /* 0x71 */ u8 unk71;
    /* 0x72 */ u8 unk72;
    /* 0x73 */ u8 unk73;
    /* 0x74 */ s16 unk74;
    /* 0x76 */ s16 unk76;
    /* 0x78 */ s16 unk78;
    /* 0x7A */ s16 unk7A;
    /* 0x7C */ s32 qWorldX;
    /* 0x80 */ s32 qWorldY;
    /* 0x84 */ s32 qUnk84;
    /* 0x88 */ s32 qUnk88;
    /* 0x8C */ s32 qUnk8C;
    /* 0x90 */ Player *player;
} Minecart;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x0C */ Sprite s2;
    /* 0x5C */ ScreenFade fade;
    /* 0x68 */ void *vram;
    /* 0x6C */ s16 worldX;
    /* 0x6E */ s16 worldY;
    /* 0x70 */ u8 unk70;
    /* 0x71 */ u8 chaoKind;
    /* 0x72 */ u8 blend;
    /* 0x73 */ s8 unk73;
    /* 0x74 */ void *someData; // allocated in sub_804E210
} IAChao;
```

```c
typedef struct {
    /* 0x04 */ AnimId anim;
    /* 0x06 */ u16 variant;
} ChaoTileInfo;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Sprite s2;
    /* 0x5C */ s16 worldX;
    /* 0x5E */ s16 worldY;

    /* 0x60 */ s16 unk60;
    /* 0x62 */ s16 unk62;
    /* 0x64 */ s16 unk64;
    /* 0x66 */ s16 unk66;
    /* 0x68 */ s16 unk68; // s2X
    /* 0x6A */ s16 unk6A; // s2Y
    /* 0x6C */ u8 unk6C_05 : 6;
    /* 0x6C */ u8 unk6C_67 : 2;
    /* 0x6D */ u8 unk6D;
    /* 0x6E */ u8 unk6E;
    /* 0x6F */ u8 unk6F;
} WindupBlock;
```

```c
typedef struct {
    SpriteBase base;
} TogglePlayerLayer;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 unk34;
    /* 0x36 */ s16 worldX;
    /* 0x38 */ s16 worldY;
    /* 0x3C */ s32 qWorldX32;
    /* 0x40 */ s32 qWorldY32;
} PlatformRaisingWheelPlatform;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ u8 unkC;
    /* 0x0D */ u8 unkD;
} IA_015;
```

```c
typedef struct {
    /* 0x00 */ PlatformShared shared;
    /* 0x2C */ Sprite s;
    /* 0x54 */ u8 filler54[4];
} Trampoline;
```

```c
typedef struct {
    SpriteBase base;
    Sprite s;
} FactoryRing;
```

```c
typedef struct {
    /* 0x00 */ PlatformShared shared;
    /* 0x2C */ Sprite s;
    /* 0x54 */ Hitbox reserved;
    /* 0x5C */ u8 data4_bits67;
    /* 0x5D */ u8 data4_bit5;
} SpringPlatform;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase2 base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 unk34[0x10];
    /* 0x44 */ Sprite s2;
    /* 0x6C */ u16 unk6C;
    /* 0x6E */ u16 unk6E;
    /* 0x70 */ u8 kind;
    /* 0x71 */ u8 unk71;
    /* 0x72 */ u8 unk72;
    /* 0x73 */ u8 unk73;
    /* 0x74 */ u8 unk74[NUM_SINGLE_PLAYER_CHARS];
    /* 0x76 */ s8 unk76[NUM_SINGLE_PLAYER_CHARS];
    /* 0x78 */ u16 unk78[NUM_SINGLE_PLAYER_CHARS];
    /* 0x7C */ s32 qWorldX;
    /* 0x80 */ s32 qWorldY;
    /* 0x84 */ Vec2_32 unk84[2];
} DashRing;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase2 base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
    /* 0x38 */ u8 unk38;
    /* 0x39 */ u8 unk39;
    /* 0x3A */ u8 unk3A;
} BreakableWall;
```

```c
typedef struct {
    /* 0x00 */ s32 qWorldX;
    /* 0x04 */ s32 qWorldY;
    /* 0x08 */ s16 qUnk8;
    /* 0x0A */ s16 qUnkA;
    /* 0x0C */ u16 qUnkC;
    /* 0x0E */ u8 unkE;
    /* 0x0F */ u8 unkF;
    /* 0x10 */ Sprite s;
} BreakableWallDebris;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Vec2_16 positions[NUM_CORD_SEGMENTS - 1]; // -1 because no need to store Player pos
    /* 0x50 */ Player *tetheredPlayer[NUM_SINGLE_PLAYER_CHARS];
} BungeeCord;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite sprites[4];
    /* 0xAC */ void *tiles;
    /* 0xB0 */ u8 unkB0;
    /* 0xB1 */ u8 unkB1;
    /* 0xB2 */ u16 timer;
    /* 0xB4 */ s16 unkB4[4];
    /* 0xBC */ s16 unkBC[4];
} PlatformMaybeFalling;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ bool8 unk34;
    /* 0x35 */ u8 qEpsilon; // Q_4_4
    /* 0x36 */ u16 delay;
    /* 0x38 */ const u16 *path;
    /* 0x3C */ Vec2_32 qWorld;
    /* 0x44 */ Vec2_32 qTarget;
} PlatformOnPath;
```

```c
typedef struct {
    u16 jump;
    u16 attack;
    u16 trick;
} ButtonConfig;
```

```c
typedef struct {
    u8 jump;
    u8 attack;
    u8 trick;
} ButtonConfigPacked;
```

```c
typedef u32 SharedKeys;
```

```c
typedef u32 SharedKeys;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Player *players[NUM_SINGLE_PLAYER_CHARS];
    /* 0x14 */ Sprite s;
    /* 0x3C */ u8 unk3C;
    /* 0x3D */ u8 unk3D;
    /* 0x3E */ s16 worldX;
    /* 0x40 */ s16 worldY;
} AccordionSpring;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ u8 unkC;
    /* 0x0D */ u8 unkD;
    /* 0x0E */ u8 kind;
} GrindRail;
```

```c
typedef struct {
    SpriteBase base;
} IA073_074;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s[3];
    /* 0x84 */ s32 worldX;
    /* 0x88 */ s32 worldY;
    /* 0x8C */ s16 unk8C;
    /* 0x8E */ u8 unk8E[NUM_SINGLE_PLAYER_CHARS];
} Lift;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s32 qWorldX;
    /* 0x10 */ s32 qWorldY;
    /* 0x14 */ u16 unk14;
    /* 0x16 */ u16 unk16;
    /* 0x18 */ u8 unk18;
    /* 0x1C */ s32 unk1C;
    /* 0x20 */ s32 unk20;
    /* 0x24 */ s32 unk24;
    /* 0x28 */ s32 unk28;
    /* 0x2C */ s32 unk2C;
    /* 0x30 */ s32 unk30;

    /* 0x34 */ s16 unk34;
    /* 0x36 */ s16 unk36;
    /* 0x38 */ Player *ps[NUM_SINGLE_PLAYER_CHARS];
    /* 0x40 */ Sprite s;
    /* 0x68 */ u8 filler68[0x10];
} PlatformSpiked;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase2 base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Hitbox reserved;
    /* 0x3C */ s32 qWorldX;
    /* 0x40 */ s32 qWorldY;
    /* 0x44 */ s32 unk44;
    /* 0x48 */ s32 unk48;
    /* 0x4C */ s32 unk4C;
    /* 0x50 */ Player *player;
    /* 0x54 */ u8 unk54;
    /* 0x55 */ u8 unk55;
    /* 0x56 */ u8 unk56;
    /* 0x57 */ u8 unk57;
    /* 0x58 */ Vec2_16 qUnk58[8];
    /* 0x78 */ Vec2_32 qUnk78[8];
    /* 0xB8 */ Sprite sprB8[3];
} PandaCart;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 kind;
    /* 0x35 */ u8 unk35;
} FlatSpring;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 filler34[0x8];
    /* 0x3C */ s16 worldX;
    /* 0x3E */ s16 worldY;
    /* 0x40 */ s16 unk40;
    /* 0x40 */ s16 unk42;
    /* 0x44 */ u8 unk44;
    /* 0x45 */ u8 unk45;
} PlatformRaisingWheel;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Sprite s2;
    /* 0x5C */ Hitbox reserved;
    /* 0x64 */ s16 worldX;
    /* 0x66 */ s16 worldY;
    /* 0x68 */ u8 unk68;
    /* 0x69 */ bool8 unk69;
    /* 0x69 */ u16 unk6A;
} Suction;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s32 qWorldX;
    /* 0x38 */ s32 qWorldY;
    /* 0x3C */ u16 unk3C;
    /* 0x3E */ u16 unk3E;
    /* 0x40 */ u8 unk40;
    /* 0x41 */ u8 unk41; // fallingSpeedMult?
    /* 0x42 */ u8 unk42;
    /* 0x43 */ u8 unk43;
} PlatformCrumbling;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s32 worldX;
    /* 0x10 */ s32 worldY;
    /* 0x14 */ u8 unk14;
} IA127_128;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 filler34[0x8];
    /* 0x3C */ s32 qWorldX;
    /* 0x40 */ s32 qWorldY;
    /* 0x44 */ s32 unk44;
    /* 0x48 */ s16 unk48;
    /* 0x4A */ s16 unk4A;
} PlatformPropelled;
```

```c
typedef struct {
    /* 0x00 */ u32 unk0;
    /* 0x04 */ u8 unk4;
    /* 0x05 */ s8 unk5;
    /* 0x06 */ s8 unk6;
    /* 0x07 */ u8 filler7[0x1];
    /* 0x08 */ s16 unk8;
    /* 0x0A */ s16 unkA;
    /* 0x0C */ s32 unkC;
    /* 0x10 */ s32 unk10;
    /* 0x14 */ Sprite s;
} CapSwitch;
```

```c
typedef struct {
    /* 0x00 */ u16 x;
    /* 0x02 */ u16 y;
    /* 0x04 */ s16 unk4;
    /* 0x08 */ Sprite s;
} PointsPopUp;
```

```c
typedef struct {
    /* 0x000 */ SpriteBase base;
    /* 0x00C */ u8 unkC;
    /* 0x00D */ u8 unkD;
    /* 0x00E */ u8 unkE;
    /* 0x00F */ u8 unkF;
    /* 0x010 */ s8 unk10; // score
    /* 0x011 */ s8 unk11;
    /* 0x012 */ s8 unk12;
    /* 0x013 */ s8 unk13;
    /* 0x014 */ u8 unk14;
    /* 0x015 */ u8 unk15;
    /* 0x016 */ s16 timer;
    /* 0x018 */ s16 unk18;
    /* 0x01A */ u8 unk1A;
    /* 0x01C */ Vec2_32 playerPos[NUM_SINGLE_PLAYER_CHARS]; // TODO: Not a pos?
    /* 0x02C */ u16 unk2C;
    /* 0x02E */ u16 unk2E;
    /* 0x030 */ s16 qUnk30[2][2];
    /* 0x038 */ s32 qUnk38[2][2];
    /* 0x048 */ s16 unk48[NUM_ANIMALS][2];
    /* 0x068 */ s32 unk68[NUM_ANIMALS][2];
    /* 0x0A8 */ void *unkA8;
    /* 0x0AC */ void *unkAC;
    /* 0x0B0 */ Sprite s;
    /* 0x0D8 */ u8 fillerD8[0x14];
    /* 0x0EC */ CapSwitch switches[NUM_SWITCHES];
    /* 0x218 */ Sprite sprTimer[21];
    /* 0x560 */ Sprite s2;
    /* 0x588 */ Sprite s3;
    /* 0x5B0 */ Sprite spr5B0[3];
    /* 0x628 */ Sprite spr628[5];
    /* 0x6F0 */ ScreenFade fade;
    /* 0x6FC */ s32 random;
} Capsule;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s16 worldX;
    /* 0x0E */ s16 worldY;
    /* 0x10 */ s16 left;
    /* 0x12 */ s16 top;
    /* 0x14 */ s16 right;
    /* 0x16 */ s16 bottom;
    /* 0x18 */ u8 unk18;
} IA_116;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 qTrajectoryX;
    /* 0x36 */ s16 qTrajectoryY;
    /* 0x38 */ s16 worldX;
    /* 0x3A */ s16 worldY;
    /* 0x3C */ s32 qWorldX;
    /* 0x40 */ s32 qWorldY;
    /* 0x44 */ s16 unk44;
    /* 0x46 */ s16 unk46;
    /* 0x48 */ u8 unk48;
    /* 0x49 */ u8 unk49;
    /* 0x4A */ u8 unk4A;
} Gondola;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s32 qWorldX;
    /* 0x10 */ s32 qWorldY;
    /* 0x14 */ s32 top;
    /* 0x18 */ s32 bottom;
    /* 0x1C */ s32 left;
    /* 0x20 */ s32 right;
} IA_090;
```

```c
typedef struct {
    SpriteBase base;
    Sprite s;
    u8 unk34;
} Checkpoint;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 unk34;
} WaggleCoil;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
    /* 0x38 */ u8 unk38;
    /* 0x39 */ u8 unk39;
} Ramp;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 kind;
    /* 0x35 */ u8 unk35;
    /* 0x35 */ u8 unk36;
} BlueRedButton;
```

```c
typedef struct {
    /* 0x00 */ BossInitFunc bossInit; // Maybe Boss creation func?
    /* 0x04 */ s32 unk4;
    /* 0x04 */ s32 unk8;
    /* 0x04 */ s32 unkC;
    /* 0x04 */ s32 unk10;
} TriggerConsts;
```

```c
typedef struct {
    /* 0x00 */ s32 unk0;
    /* 0x04 */ s32 unk4;
    /* 0x08 */ s32 unk8;
    /* 0x0C */ s32 unkC;
    /* 0x10 */ s32 qCamX;
    /* 0x14 */ s32 qCamY;
} TriggerCamState;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s32 qWorldX;
    /* 0x10 */ s32 qWorldY;
    /* 0x14 */ TriggerCamState camState;
    /* 0x2C */ s16 unk2C;
    /* 0x2E */ u8 bossId;
    /* 0x2F */ u8 unk2F;
    /* 0x30 */ struct Task *bossTask;
    /* 0x34 */ u16 unk34;
    /* 0x36 */ u16 unk36;
    /* 0x38 */ u16 unk38;
    /* 0x3A */ u16 unk3A;
    /* 0x3C */ s32 unk3C;
} TriggerBossOrGoal;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase2 base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 targetZone;
} ZoneWarp;
```

```c
typedef struct {
    /* 0x00 */ PlatformShared shared;
    /* 0x2C */ Sprite s;
    /* 0x54 */ u8 kindA;
    /* 0x55 */ u8 flags_lo : 2;
    /* 0x55 */ u8 flags_2 : 1;
    /* 0x55 */ u8 flags_3 : 1;
    /* 0x55 */ u8 flags_4 : 1;
    /* 0x55 */ u8 flags_5 : 1;
} Platform;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s[2];
    /* 0x5C */ Sprite s3[2];
    /* 0xAC */ void *tiles;
    /* 0xB0 */ u8 unkB0;
    /* 0xB1 */ u8 unkB1;
    /* 0xB2 */ u8 unkB2;
    /* 0xB3 */ u8 unkB3;
} BonusUfo;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u16 regionX;
    /* 0x06 */ u16 regionY;
    /* 0x08 */ u8 meX;
    /* 0x09 */ u8 id;
    /* 0x0A */ s16 worldX;
    /* 0x0C */ s16 worldY;
    /* 0x0E */ u8 unkE;
    /* 0x0F */ u8 unkF;
    /* 0x10 */ u8 unk10;
    /* 0x14 */ Player *ps[NUM_SINGLE_PLAYER_CHARS];
    /* 0x1C */ Sprite s;
} SpringInABox;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ u8 unkC;
    /* 0x0D */ u8 unkD;
    /* 0x0E */ u8 fillerE[0x2];
    /* 0x10 */ u16 worldX;
    /* 0x12 */ u16 worldY;
    /* 0x14 */ s8 left;
    /* 0x15 */ s8 top;
    /* 0x16 */ s8 right;
    /* 0x17 */ s8 bottom;
} IA085 /* size: 0x18 */;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Sprite s2;
    /* 0x5C */ s16 worldX;
    /* 0x5E */ s16 worldY;
    /* 0x60 */ s32 qWorldX;
    /* 0x64 */ s32 qWorldY;
    /* 0x68 */ s32 qUnk68; // speed?
    /* 0x6C */ s32 qUnk6C;
    /* 0x70 */ s32 qUnk70;
    /* 0x74 */ void *tiles;
    /* 0x78 */ s16 unk78;
    /* 0x7A */ u8 unk7A;
    /* 0x7B */ u8 unk7B;
    /* 0x7C */ u8 unk7C;
    /* 0x7D */ s8 unk7D[4][4];
} Boulder;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 kind;
} Spikes;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
    /* 0x38 */ u8 direction;
    /* 0x39 */ u8 unk39;
    /* 0x3A */ u8 unk3A;
} Spring;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u16 regionX;
    /* 0x06 */ u16 regionY;
    /* 0x08 */ u8 meX;
    /* 0x09 */ u8 id;
    /* 0x0A */ s16 worldX;
    /* 0x0C */ s16 worldY;
    /* 0x10 */ Player *ps[NUM_SINGLE_PLAYER_CHARS];
    /* 0x18 */ Sprite s;
} AirBubbles;
```

```c
typedef struct {
    /* 0x00 */ s32 qWorldX;
    /* 0x04 */ s32 qWorldY;
    /* 0x08 */ u8 unk8;
    /* 0x0C */ Player *ps[NUM_SINGLE_PLAYER_CHARS];
    /* 0x14 */ Sprite s;
} BigAirBubble;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Sprite s2;
    /* 0x5C */ s32 qWorldX;
    /* 0x60 */ s32 qWorldY;
    /* 0x64 */ u16 unk64;
    /* 0x66 */ s16 qUnk66;
    /* 0x68 */ s16 qUnk68;
    /* 0x6A */ s16 qUnk6A;
} SlowChaosLift;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Sprite s2;
    /* 0x5C */ Sprite s3;
    /* 0x84 */ u8 unk84;
    /* 0x85 */ u8 unk85;
    /* 0x86 */ u8 unk86;
    /* 0x87 */ u8 unk87;
    /* 0x88 */ Vec2_32 qPositions[4];
    /* 0xA8 */ s16 qUnkA8[4][2];
} DecoRock;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 kind;
    /* 0x35 */ u8 unk35;
    /* 0x36 */ u8 unk36;
} Booster;
```

```c
typedef struct {
    /* 0x00 */ Sprite s;
    /* 0x28 */ s32 qUnk28;
    /* 0x2C */ s32 qUnk2C;
    /* 0x30 */ s16 unk30;
    /* 0x32 */ s16 unk32;
    /* 0x34 */ u8 unk34;
} BonusFlower;
```

```c
typedef struct {
    /* 0x000 */ SpriteBase base;
    /* 0x00C */ u8 unkC[4];
    /* 0x010 */ s16 timer;
    /* 0x012 */ s16 unk12;
    /* 0x014 */ u8 unk14;
    /* 0x015 */ u8 unk15;
    /* 0x016 */ s8 unk16;
    /* 0x017 */ u8 unk17;
    /* 0x018 */ Sprite sprTimer[21];
    /* 0x360 */ Sprite sprCountdownDigit;
    /* 0x388 */ Sprite sprKillBar[NUM_DEFEATABLE_ENEMIES];
    /* 0x4C8 */ Sprite sprPlayer1Icon;
    /* 0x4F0 */ Sprite sprPlayer2Icon;
    /* 0x518 */ Sprite spr518;
    /* 0x540 */ Sprite spr540;
    /* 0x568 */ Sprite spr568;
    /* 0x590 */ ScreenFade fade;
} BonusGameUI;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 destructDelay;
    /* 0x36 */ u8 variant;
    /* 0x37 */ u8 unk37;
    /* 0x38 */ s32 worldX;
    /* 0x3C */ s32 worldY;
} ToyBalloon;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Hitbox reserved34[2];
    /* 0x44 */ Sprite s2;
    /* 0x6C */ void *tiles;
    /* 0x70 */ s16 worldX;
    /* 0x72 */ s16 worldY;
    /* 0x74 */ s8 unk74;
    /* 0x75 */ s8 unk75;
} WaterCannon;
```

```c
typedef struct Seesaw {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ SpriteTransform tf;
    /* 0x40 */ Sprite s2;
    /* 0x68 */ u16 unk68;
    /* 0x6A */ s16 unk6A;
    /* 0x6C */ s32 unk6C;
    /* 0x70 */ s32 unk70;
    /* 0x74 */ s16 unk74;
    /* 0x76 */ s16 unk76;
    /* 0x78 */ u8 unk78[2];
    /* 0x7A */ u8 unk7A;
    /* 0x7B */ u8 unk7B;
} Seesaw;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s[2];
    /* 0x5C */ s16 unk5C;
} GoalRing;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
} FinalZoneRing;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s0;
    /* 0x34 */ Sprite s1;
    /* 0x5C */ s16 worldX;
    /* 0x5E */ s16 worldY;
    /* 0x60 */ u8 unk60;
    /* 0x61 */ u8 act;
    /* 0x62 */ u8 unk62;
    /* 0x63 */ u8 wasCompletedBefore;
} ActRing;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s[2];
    /* 0x5C */ u8 state;
    /* 0x5D */ u8 unk5D;
    /* 0x5E */ s16 unk5E;
    /* 0x60 */ s16 unk60;
    /* 0x62 */ s16 worldX;
    /* 0x64 */ s16 worldY;
    /* 0x68 */ void *tiles;
} ClosingWall;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u16 unk34;
    /* 0x36 */ u16 unk36;
    /* 0x38 */ u32 unk38;
    /* 0x3C */ u32 unk3C;
    /* 0x40 */ u32 unk40;
    /* 0x44 */ u32 unk44;
} IA125_126;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s32 qWorldX;
    /* 0x10 */ s32 qWorldY;
    /* 0x14 */ s32 unk14;
    /* 0x18 */ s32 unk18;
    /* 0x1C */ s32 unk1C;
    /* 0x20 */ s32 unk20;
    /* 0x24 */ u8 unk24;
    /* 0x28 */ Player *chars[NUM_SINGLE_PLAYER_CHARS];
    /* 0x30 */ Sprite s;
} IA_095;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
    /* 0x38 */ u8 direction;
    /* 0x39 */ u8 unk39;
    /* 0x3A */ u8 unk3A;
} Spring;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ u8 direction; // (x38)
    /* 0x35 */ u8 unk35; // (x3A)
    /* 0x36 */ u8 unk36;
    /* 0x36 */ u8 unk37;
    /* 0x36 */ u8 unk38;
} ButtonSpring;
```

```c
typedef struct {
    /* 0x00*/ SpriteBase base;
    /* 0x0C */ s32 qWorldX;
    /* 0x10 */ s32 qWorldY;
    /* 0x14 */ s16 qUnk14;
    ;
    /* 0x14 */ u8 unk16;
    ;
    /* 0x18 */ Player *ps[NUM_SINGLE_PLAYER_CHARS];
    /* 0x20 */ Sprite s;
    /* 0x48 */ u8 filler48[0x8];
} PlatformSquare;
```

```c
typedef struct {
    /* 0x00 */ s16 screenX0;
    /* 0x02 */ s16 screenY0;
    /* 0x04 */ s16 screenX1;
    /* 0x06 */ s16 screenY1;
    /* 0x08 */ s16 unk8;
} Ball;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Sprite s2;
    /* 0x5C */ Ball balls[NUM_SEGMENTS];
    /* 0xBC */ u16 unkBC;
    /* 0xBE */ u16 unkBE;
    /* 0xC0 */ s8 unkC0[NUM_SINGLE_PLAYER_CHARS];
    /* 0xC2 */ u8 unkC2[NUM_SINGLE_PLAYER_CHARS];
    /* 0xC4 */ s32 worldX;
    /* 0xC8 */ s32 worldY;
    /* 0xCC */ void *tiles;
} FerrisWheel;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
} PlaygroundEmerald;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ Sprite s2;
    /* 0x5C */ Player *player;
    /* 0x60 */ u8 unk60;
    /* 0x61 */ u8 textId;
    /* 0x62 */ u8 unk62;
    /* 0x64 */ void *data;
} Omochao;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase2 base;
} Warp;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
    /* 0x38 */ u8 unk38;
} SpecialKey;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    u8 filler34[8];
    /* 0x3C */ u8 unk3C;
    /* 0x3D */ u8 unk3D;
    /* 0x3E */ u16 unk3E;
    /* 0x40 */ s16 worldX;
    /* 0x42 */ s16 worldY;
} Maze;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
    /* 0x38 */ u8 unk38;
} IA_MP024;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase4 base;
    /* 0x10 */ Sprite s;
    /* 0x38 */ u16 unk38;
    /* 0x3A */ s16 unk3A;
    /* 0x3C */ u8 unk3C;
    /* 0x3D */ u8 unk3D;
    /* 0x40 */ Player *player;
} RotatingHandle;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ u8 type;
    /* 0x0D */ u8 unkD[NUM_SINGLE_PLAYER_CHARS];
} IA081_082;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s32 qWorldX;
    /* 0x10 */ s32 qWorldY;

    /* 0x14 */ s16 left;
    /* 0x16 */ s16 top;
    /* 0x18 */ s16 right;
    /* 0x1A */ s16 bottom;
    /* 0x1C */ s32 qMiddleX;
    /* 0x20 */ s16 offsetMiddle;
    /* 0x22 */ s16 unk22;
    /* 0x24 */ u16 unk24;
    /* 0x26 */ u8 filler26[0x2];
    /* 0x28 */ s32 unk28[MAX_BRIDGE_SEGMENTS];
    /* 0x68 */ u16 numSegments;
    /* 0x6C */ s32 unk6C;
    /* 0x70 */ s32 unk70;
    /* 0x74 */ Player *ps[NUM_SINGLE_PLAYER_CHARS];
    /* 0x7C */ Player *unk7C;
    /* 0x80 */ Sprite s;
} SunsetBridge;
```

```c
typedef struct {
    s32 qUnk0;
    s32 qUnk4;
    s32 qUnk8;
    s32 qUnkC;
} IceSpikeParams;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase3 base;
    /* 0x1C */ Player *players[NUM_SINGLE_PLAYER_CHARS];
    /* 0x24 */ Sprite s;
    /* 0x4C */ Hitbox reserved;
    /* 0x54 */ s32 unk54[14];
    /* 0x8C */ u32 unk8C[14];
    /* 0xC4 */ u16 unkC4[14];
    /* 0xC4 */ u16 unkE0[14];
    /* 0xFC */ Sprite s2[3];
} IceSpike;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite sprBox;
    /* 0x34 */ Sprite sprItem;
    /* 0x5C */ SpriteTransform transform;
    /* 0x68 */ Player *player;
    /* 0x6C */ s16 worldX;
    /* 0x6E */ s16 worldY;
    /* 0x70 */ s16 qUnk70;
    /* 0x72 */ u8 unk72;
    /* 0x73 */ u8 unk73;
    /* 0x74 */ u8 unk74; // TODO: Is that a 4:4 bitfield?
} ItemBoxMP;
```

```c
typedef struct {
    /* 0x00 */ Sprite s;
    /* 0x28 */ s16 worldX;
    /* 0x2A */ s16 worldY;
} CloudEffect;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s16 worldX;
    /* 0x0E */ s16 worldY;
} IA_135;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s16 worldX;
    /* 0x0E */ s16 worldY;
    /* 0x10 */ s16 left;
    /* 0x12 */ s16 top;
    /* 0x14 */ s16 right;
    /* 0x16 */ s16 bottom;
    /* 0x18 */ u8 type;
    /* 0x19 */ u8 unk19;
} IA117_119;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ bool8 unkC;
    /* 0x0D */ u8 unkD[NUM_SINGLE_PLAYER_CHARS];
} IA094;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s0;
    /* 0x34 */ Sprite sprCompletionCrown;
    /* 0x5C */ u8 filler5C[0x50];
    /* 0xAC */ s16 worldX;
    /* 0xAE */ s16 worldY;
    /* 0xB0 */ bool8 wasCompletedBefore;
} SpecialSpring;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ Sprite s;
    /* 0x34 */ s16 worldX;
    /* 0x36 */ s16 worldY;
    /* 0x38 */ s32 qWorldX;
    /* 0x3C */ s32 qWorldY;
    /* 0x40 */ u16 unk40;
    /* 0x42 */ u8 unk42;
    /* 0x43 */ u8 unk43;
} PlatformCA;
```

```c
typedef struct {
    s16 unk0;
    s16 unk2;
    s16 unk4;
    s16 unk6;
    u16 unk8;
    u16 unkA;
    u16 unkC;
    u16 unkE;
    u16 unk10;
    u16 unk12;
    u32 unk14;
    u32 unk18;
    u32 unk1C;
} UNK_8085D14;
```

```c
typedef struct {
    u16 unk0;
    s16 unk2;
    s16 unk4;
    s16 unk6;
    s32 unk8;
    s32 unkC;
    u16 unk10;
    u16 unk12;
    u32 unk14;
    u32 unk18;
    u32 unk1C;
} UNK_8085D14_2;
```

```c
typedef struct {
    void *unk0;
    void *start;
    void *next;
    void *unkC;
} UNK_8085DEC;
```

```c
typedef union {
    struct {
        u16 unused : 5;
        u16 dstCtrl : 2;
        u16 srcCtrl : 2;
        u16 repeat : 1;
        u16 is32bit : 1;
        u16 pakDRQ : 1;
        u16 startTiming : 2;
        u16 irqAtEnd : 1;
        u16 enable : 1;
    } split;

    u16 raw;
} DMACtrl;
```

```c
typedef struct {
    s16 x;
    s16 y;
} Unknown;
```

```c
typedef struct {
    u8 *data;
    int width, height;
} TextureBuffer;
```

```c
typedef struct {
    /* 0x00 */ u8 filler0[0x4C];
    /* 0x4C */ u8 unk4C;
    /* 0x4D */ u8 unk4D;
    /* 0x4E */ u8 filler4E[0x4];
    /* 0x52 */ u16 unk52;
    /* 0x54 */ u8 unk54;
    /* 0x55 */ u8 unk55; // used to determine item type in MP itemboxes (15 + (unk55 & 0x1))
    /* 0x56 */ u8 unk56;
} Struct_03001060;
```

```c
typedef signed char int_least8_t;
```

```c
typedef short int_least16_t;
```

```c
typedef int int_least32_t;
```

```c
typedef long long int_least64_t;
```

```c
typedef unsigned char uint_least8_t;
```

```c
typedef unsigned short uint_least16_t;
```

```c
typedef unsigned int uint_least32_t;
```

```c
typedef unsigned long long uint_least64_t;
```

```c
typedef int int_fast8_t;
```

```c
typedef int int_fast16_t;
```

```c
typedef int int_fast32_t;
```

```c
typedef long long int_fast64_t;
```

```c
typedef unsigned int uint_fast8_t;
```

```c
typedef unsigned int uint_fast16_t;
```

```c
typedef unsigned int uint_fast32_t;
```

```c
typedef unsigned long long uint_fast64_t;
```

```c
typedef long long intmax_t;
```

```c
typedef unsigned long long uintmax_t;
```

```c
typedef uint16_t winreg_t;
```

```c
typedef uint8_t u8;
```

```c
typedef uint16_t u16;
```

```c
typedef uint32_t u32;
```

```c
typedef uint64_t u64;
```

```c
typedef int8_t s8;
```

```c
typedef int16_t s16;
```

```c
typedef int32_t s32;
```

```c
typedef int64_t s64;
```

```c
typedef u8 MetatileIndexType;
```

```c
typedef u8 MetatileIndexType;
```

```c
typedef u8 int_vcount;
```

```c
typedef u8 int_vcount;
```

```c
typedef volatile u8 vu8;
```

```c
typedef volatile u8 vu8;
```

```c
typedef volatile u16 vu16;
```

```c
typedef volatile u16 vu16;
```

```c
typedef volatile u32 vu32;
```

```c
typedef volatile u32 vu32;
```

```c
typedef volatile u64 vu64;
```

```c
typedef volatile u64 vu64;
```

```c
typedef volatile s8 vs8;
```

```c
typedef volatile s8 vs8;
```

```c
typedef volatile s16 vs16;
```

```c
typedef volatile s16 vs16;
```

```c
typedef volatile s32 vs32;
```

```c
typedef volatile s32 vs32;
```

```c
typedef volatile s64 vs64;
```

```c
typedef volatile s64 vs64;
```

```c
typedef float f32;
```

```c
typedef double f64;
```

```c
typedef u8 bool8;
```

```c
typedef u8 bool8;
```

```c
typedef u16 bool16;
```

```c
typedef u16 bool16;
```

```c
typedef u32 bool32;
```

```c
typedef u32 bool32;
```

```c
typedef volatile struct BgCnt vBgCnt;
```

```c
typedef struct  OamDataShort { u32 y : 8; u32 affineMode : 2; u32 objMode : 2; u32 mosaic : 1; u32 bpp : 1; u32 shape : 2; u32 x : 9; u32 matrixNum : 5; u32 size : 2; u16 tileNum : 10; u16 priority : 2; u16 paletteNum : 4;} OamDataShort;
```

```c
typedef union {
    struct {
             u32 y:8;
             u32 affineMode:2;
             u32 objMode:2;
             u32 mosaic:1;
             u32 bpp:1;
             u32 shape:2;
             u32 x:9;
             u32 matrixNum:5;
             u32 size:2;
             u16 tileNum:10;
             u16 priority:2;
             u16 paletteNum:4;
             u16 fractional:8;
             u16 integer:7;
             u16 sign:1;
    } split;
    struct {
        u16 attr0;
        u16 attr1;
        u16 attr2;
        u16 affineParam;
    } all;
    u16 raw[4];
} OamData;
```

```c
typedef struct {
    u32 srcLength : 16;
    u32 srcWidth : 8;
    u32 dstWidth : 8;
} BitUnPackData;
```

```c
typedef struct {
    u16 index : 10;
    u16 xFlip : 1;
    u16 yFlip : 1;
    u16 pal : 4;
} Tile;
```

```c
typedef struct {
               u16 xTiles;
               u16 yTiles;
               u16 animTileSize;
               u8 animFrameCount;
               u8 animDelay;
               const u8 *tiles;
               u32 tilesSize;
               const u16 *palette;
               u16 palOffset;
               u16 palLength;
               const u16 *map;
} Tilemap;
```

```c
typedef struct {
    s16 x;
    s16 y;
} Vec2_16;
```

```c
typedef struct {
    u16 x;
    u16 y;
} Vec2_u16;
```

```c
typedef struct {
    s32 x;
    s32 y;
} Vec2_32;
```

```c
typedef struct {
    u8 reserved : 4;
    u8 compressedType : 4;
    u32 size : 24;
    void *data;
} RLCompressed;
```

```c
typedef struct {
               u16 pa, pb, pc, pd;
               u32 x, y;
} BgAffineReg;
```

```c
typedef bool32 (*VBlankFunc)(void);
```

```c
typedef u16 TaskPtr;
```

```c
typedef u16 TaskPtr;
```

```c
typedef u32 TaskPtr32;
```

```c
typedef u32 TaskPtr32;
```

```c
typedef u16 IwramData;
```

```c
typedef u16 IwramData;
```

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
typedef u16 IwramNodePtr;
```

```c
typedef u16 IwramNodePtr;
```

```c
typedef u32 IwramNodePtr32;
```

```c
typedef u32 IwramNodePtr32;
```

```c
typedef u16 AnimId;
```

```c
typedef u16 AnimId;
```

```c
typedef struct {
               struct GraphicsData graphics;
               u16 *layoutVram;
               const u16 *layout;
               u16 xTiles;
               u16 yTiles;
               u16 unk18;
               u16 unk1A;
               u16 tilemapId;
               u16 unk1E;
               u16 unk20;
               u16 unk22;
               u16 unk24;
               u16 targetTilesX;
               u16 targetTilesY;
               u8 paletteOffset;
               u8 animFrameCounter;
               u8 animDelayCounter;
               u16 flags;
               u16 scrollX;
               u16 scrollY;
               u16 prevScrollX;
               u16 prevScrollY;
               const u16 *metatileMap;
               u16 mapWidth;
               u16 mapHeight;
} Background;
```

```c
typedef struct {
               u16 oamIndex;
               u16 numSubframes;
               u16 width;
               u16 height;
               s16 offsetX;
               s16 offsetY;
} SpriteOffset;
```

```c
typedef struct {
               s32 index;
               s8 left;
               s8 top;
               s8 right;
               s8 bottom;
} HitboxOld;
```

```c
typedef struct {
               s32 index;
               Rect8 b;
} Hitbox;
```

```c
typedef struct {
               u8 *tiles;
               u32 frameNum;
               u32 frameFlags;
               u16 anim;
               u16 animCursor;
               s16 x;
               s16 y;
               s16 oamFlags;
               s16 qAnimDelay;
               u16 prevAnim;
               u8 variant;
               u8 prevVariant;
               u8 animSpeed;
               u8 oamBaseIndex;
               u8 numSubFrames;
               u8 palId;
               Hitbox hitboxes[1];
} Sprite;
```

```c
typedef struct {
               u8 *tiles;
               u32 frameNum;
               u32 frameFlags;
               u16 anim;
               u16 animCursor;
               s16 x;
               s16 y;
               s16 oamFlags;
               s16 qAnimDelay;
               u16 prevAnim;
               u8 variant;
               u8 prevVariant;
               u8 animSpeed;
               u8 oamBaseIndex;
               u8 numSubFrames;
               u8 palId;
               Hitbox hitboxes[2];
} Sprite2;
```

```c
typedef struct {
               u16 rotation;
               s16 qScaleX;
               s16 qScaleY;
               s16 x;
               s16 y;
} SpriteTransform;
```

```c
typedef struct {
               s16 unk0[4];
               s16 qDirX;
               s16 qDirY;
               s16 unkC[2];
               s32 posX;
               s32 posY;
               s16 unk18[2][2];
               u16 affineIndex;
} UnkSpriteStruct;
```

```c
typedef struct {
               u32 numTiles;
               AnimId anim;
               u8 variant;
} TileInfo;
```

```c
typedef struct {
               AnimId anim;
               u8 variant;
               u32 numTiles;
} TileInfo2;
```

```c
typedef struct PACKED {
               u16 numTiles;
               AnimId anim;
               u16 variant;
} TileInfo_16;
```

```c
typedef enum {
    ACMD_RESULT__ANIM_CHANGED = -1,
    ACMD_RESULT__ENDED = 0,
    ACMD_RESULT__RUNNING = +1,
} AnimCmdResult;
```

```c
typedef AnimCmdResult (*AnimationCommandFunc)(void *cursor, Sprite *sprite);
```

```c
typedef struct {
               s32 cmdId;
               s32 tileIndex;
               u32 numTilesToCopy;
} ACmd_GetTiles;
```

```c
typedef struct {
               s32 cmdId;
               s32 palId;
               u16 numColors;
               u16 insertOffset;
} ACmd_GetPalette;
```

```c
typedef struct {
               s32 cmdId;
               s32 offset;
} ACmd_JumpBack;
```

```c
typedef struct {
               s32 cmdId;
} ACmd_4;
```

```c
typedef struct {
               s32 cmdId;
               u16 songId;
} ACmd_PlaySoundEffect;
```

```c
typedef struct {
               s32 cmdId;
               Hitbox hitbox;
} ACmd_Hitbox;
```

```c
typedef struct {
               s32 cmdId;
               u16 x;
               u16 y;
} ACmd_TranslateSprite;
```

```c
typedef struct {
               s32 cmdId;
               s32 unk4;
               s32 unk8;
} ACmd_8;
```

```c
typedef struct {
               s32 cmdId;
               AnimId animId;
               u16 variant;
} ACmd_SetIdAndVariant;
```

```c
typedef struct {
               s32 cmdId;
               s32 unk4;
               s32 unk8;
               s32 unkC;
} ACmd_10;
```

```c
typedef struct {
               s32 cmdId;
               s32 priority;
} ACmd_SetSpritePriority;
```

```c
typedef struct {
               s32 cmdId;
               s32 orderIndex;
} ACmd_SetOamOrder;
```

```c
typedef struct {
    s32 delay;
    s32 index;
} ACmd_ShowFrame;
```

```c
typedef union {
    s32 id;
    ACmd_GetTiles tiles;
    ACmd_GetPalette pal;
    ACmd_JumpBack jump;
    ACmd_4 end;
    ACmd_PlaySoundEffect sfx;
    ACmd_Hitbox _6;
    ACmd_TranslateSprite translate;
    ACmd_8 _8;
    ACmd_SetIdAndVariant setAnimId;
    ACmd_10 _10;
    ACmd_SetSpritePriority _11;
    ACmd_SetOamOrder setOamOrder;
    ACmd_ShowFrame show;
} ACmd;
```

```c
typedef u32 collPxDim_t;
```

```c
typedef u32 collPxDim_t;
```

```c
typedef struct Collision {
               const s8 *height_map;
               const u8 *tile_rotation;
               const u16 *metatiles;
               const MetatileIndexType *map[2];
               const u16 *flags;
               u16 levelX, levelY;
               collPxDim_t pxWidth, pxHeight;
} Collision;
```

```c
typedef struct  MapEntity { u8 x; u8 y; u8 index; union { s8 sData[5]; u8 uData[5]; } d;} MapEntity;
```

```c
typedef struct  MapEntity_Itembox { u8 x; u8 y; u8 index;} MapEntity_Itembox;
```

```c
typedef struct  MapEntity_Ring { u8 x; u8 y;} MapEntity_Ring;
```

```c
typedef struct {
               MapEntity *me;
               u16 regionX;
               u16 regionY;
               u8 unk8;
               u8 unk9;
               u8 meX;
               u8 id;
} SpriteBase;
```

```c
typedef struct {
               MapEntity *me;
               u16 regionX;
               u16 regionY;
               u16 unk8;
               u8 meX;
               u8 id;
} SpriteBase2;
```

```c
typedef struct {
               MapEntity *me;
               s32 qWorldX;
               s32 qWorldY;
               u16 regionX;
               u16 regionY;
               u16 unk10;
               s16 unk12;
               u8 meX;
               u8 id;
               u8 unk16;
               u8 unk17;
               u8 unk18;
               u8 unk19;
} SpriteBase3;
```

```c
typedef struct {
               MapEntity *me;
               u16 regionX;
               u16 regionY;
               u8 filler8[0x2];
               u16 qSpeedAirX;
               u16 qSpeedAirY;
               u8 meX;
               u8 id;
} SpriteBase4;
```

```c
typedef struct {
               MapEntity *me;
               u16 regionX;
               u16 regionY;
               u8 meX;
               u8 id;
               u8 unkA;
               u8 unkB;
} SpriteBase5;
```

```c
typedef struct {
    SpriteBase base;
    Sprite s;
} EnemyBase;
```

```c
typedef struct Player Player;
```

```c
typedef union  StateNum { u16 raw; struct { u8 subCount : 4; u8 other : 3; u8 subHighBit : 1; s8 highValue : 8; } split;} StateNum;
```

```c
typedef struct {
               SpriteTransform tf;
               Sprite2 s;
} PlayerSpriteInfo;
```

```c
typedef struct PlayerUnkC4 {
    u32 unk0;
    s16 playerId;
} PlayerUnkC4;
```

```c
typedef struct PlayerUnk148_A {
    s16 unk0;
    s16 unk2;
    u8 unk4;
    u8 unk5;
    u8 unk6;
    u8 unk7;
    s16 unk8;
    u8 unkA;
    u8 unkB;
    s16 unkC;
} PlayerUnk148_A;
```

```c
typedef struct PlayerUnk148_B {
    s16 unk0;
    u8 unk2;
    u8 unk3;
    u8 unk4;
    u8 unk5;
    u8 unk6;
    u8 unk7;
    u8 unk8;
    u8 unk9;
    u8 unkA;
    u8 unkB;
    s16 unkC;
} PlayerUnk148_B;
```

```c
typedef struct PlayerUnk148_C {
    s16 unk0;
    u8 unk2;
    u8 unk3;
    u8 *tiles;
    u8 unk8;
    u8 unk9;
    u8 unkA;
    u8 unkB;
    s16 unkC;
} PlayerUnk148_C;
```

```c
typedef struct PlayerUnk148_D {
    u8 unk0[0x8];
    u16 unk8;
    s16 someAnim0;
    Sprite s;
} PlayerUnk148_D;
```

```c
typedef union PlayerUnk148 {
    PlayerUnk148_A a;
    PlayerUnk148_B b;
    PlayerUnk148_C c;
    PlayerUnk148_D d;
} PlayerUnk148;
```

```c
typedef struct Struc_3001150 {
    u8 filler0[0x1C];
    u8 filler1C[0x4];
    u8 filler20[0x450];
} Struc_3001150;
```

```c
typedef struct {
               MapEntity *me;
               bool32 unk4;
               s8 meX;
               u8 filler9[0x3];
               u16 regionX;
               u16 regionY;
               s32 posX;
               s32 posY;
               s32 unk18;
               Sprite *spr;
               u8 filler20[0x8];
} EnemyUnknownStruc0;
```

```c
typedef struct {
    u16 jump;
    u16 attack;
    u16 trick;
} ButtonConfig;
```

```c
typedef struct {
    u8 jump;
    u8 attack;
    u8 trick;
} ButtonConfigPacked;
```

```c
typedef struct {
    u8 Act1 : 1;
    u8 Act2 : 1;
    u8 Act3 : 1;
    u8 Boss : 1;
    u8 BonusCapsule : 1;
    u8 BonusEnemies : 1;
    u8 Bit7 : 1;
} ZoneCompletion;
```

```c
typedef struct {
    u8 Bronze : 1;
    u8 Silver : 1;
    u8 Gold : 1;
} MedalCollection;
```

```c
typedef struct {
               u32 playerId;
               u16 playerName[6];
               bool8 slotFilled;
               u8 wins;
               u8 losses;
               u8 draws;
} VsRecords;
```

```c
typedef struct {
               u8 slotFilled;
               u8 wins;
               u8 draws;
               u8 losses;
               u32 playerId;
               u16 playerName[6];
} VsRecords2;
```

```c
typedef struct TimeRecord {
    u8 character1;
    u8 character2;
    u16 time;
} TimeRecord;
```

```c
typedef struct TimeRecords {
    TimeRecord table[7][4][5];
} TimeRecords;
```

```c
typedef struct {
               u32 playerId;
               u16 playerName[6];
               u8 unlockedCharacters;
               u8 unlockedZones;
               u8 continueZone;
               u8 unk13;
               u16 chaoCount[7];
               u8 specialKeys[7];
               u8 unlockedStages[9];
               u8 collectedEmeralds;
               u8 unlockFlags;
               u16 unk34;
               u8 unk36;
               u8 collectedMedals[9][4];
               u8 unk5B;
               u8 unk5C;
               u8 unk5D;
               u16 unk5E;
               u8 vsWins;
               u8 vsLosses;
               u8 vsDraws;
               u8 unk63;
               VsRecords vsRecords[10];
                TimeRecords timeRecords;
                ButtonConfig buttonConfig;
                u8 difficulty;
                bool8 disableTimeLimit;
                u8 language;
                u8 unk367;
} SaveGame;
```

```c
typedef struct SaveSectorHeader {
                u32 magicNumber;
                u32 sectorId;
} SaveSectorHeader;
```

```c
typedef struct {
    SaveSectorHeader header;
                u32 playerId;
                u16 playerName[6];
                u8 unk18;
                u8 unlockedCharacters;
                u8 unlockedZones;
                u8 continueZone;
                u8 unk1C;
                u16 chaoCount[7];
                u8 specialKeys[7];
                u8 unlockedStages[9];
                u8 collectedEmeralds;
                u8 unlockFlags;
                u8 collectedMedals[9][4];
                u16 unk62;
                u8 vsWins;
                u8 vsDraws;
                u8 vsLosses;
    u8 unk67;
    VsRecords2 vsRecords[10];
                TimeRecords timeRecords;
                ButtonConfigPacked buttonConfig;
                u8 difficulty;
                bool8 disableTimeLimit;
                u8 language;
                u8 unk367;
                u32 checksum;
} SaveSectorData;
```

```c
typedef struct {
               s32 qWorldX;
               s32 qWorldY;
               s32 qWorldX2;
               s32 qWorldY2;
               s16 unk10;
               s16 unk12;
               s16 unk14;
               u16 moveState;
               u8 unk18;
               u8 unk19;
               u8 unk1A;
               u8 unk1B;
               u8 unk1C;
               u8 unk1D;
               u8 filler1E[0x2];
               Sprite2 s;
               Player *player;
               Player *unk54;
} Cheese;
```

```c
typedef struct {
               u8 language;
               u8 difficulty;
               u8 unk2;
               u8 gameMode;
               u8 unk4;
               u8 unk5;
               u8 playerIndex;
               u8 unk7;
               u8 unk8;
               u8 zone;
               u8 act;
               u8 entryIndex;
               u8 unkC;
               u8 unkD;
               u16 currMapIndex;
               u16 unk10;
               u16 nextMapIndex;
               ButtonConfig buttonConfig;
               u32 timer;
               u8 unk20;
               u8 unk21;
               u8 filler22[2];
               u32 unk24;
               u16 respawnX;
               u16 respawnY;
               u8 platformTimerEnableBits;
               u8 springTimerEnableBits;
               u16 platformTimers[8];
               u16 springTimers[8];
               u16 unk4E[8];
               s16 unk5E[8];
               u16 unk6E[8];
               u8 filler7E[0x2];
               u16 *unk80;
               u8 unk84;
               u8 unk85;
               u8 unk86;
               u8 flagSpKey;
               u8 PADDING42[0x04];
               u16 unk8C;
               u8 unk8E;
               u8 unk8F;
               struct Task *task90;
               u32 unk94;
               struct Task *taskCheese;
               struct Task *task9C;
               u32 unkA0;
               u32 unkA4;
               u32 unkA8;
               u16 rings;
               u16 levelTimer;
               u16 unkB0;
               u16 unkB2;
               u8 lives;
               u8 unkB5;
               u8 unkB6;
               u8 unkB7;
               u8 unkB8;
               u8 unkB9;
               u8 unkBA;
               u8 unkBB;
               u8 unkBC;
               u8 unkBD;
               u8 unkBE[7];
} StageData;
```

```c
typedef enum {
    ACT_TYPE_ACT_1 = 0x01,
    ACT_TYPE_ACT_2 = 0x02,
    ACT_TYPE_ACT_3 = 0x04,
    ACT_TYPE_BOSS = 0x08,
    ACT_TYPE_MINIGAME_CAPSULE = 0x10,
    ACT_TYPE_MINIGAME_ENEMIES = 0x20,
    ACT_TYPE_40 = 0x40,
    ACT_TYPE_80 = 0x80,
} eActType;
```

```c
typedef struct Hariisen {
               MapEntity *me;
               u8 id;
               u8 meX;
               u16 region[2];
               u16 unkA;
               u16 unkC[2];
               u16 unk10[2];
               u16 unk14[4];
               Vec2_32 qUnk1C;
               Vec2_32 qPos;
               Vec2_32 qUnk2C[2];
               Vec2_32 qUnk3C[4];
               Sprite2 s;
               Sprite2 s2;
               Sprite2 s3;
} Hariisen;
```

```c
typedef struct HariisenProj {
               u8 unk0[2];
               u8 unk2[4];
               u16 region[2];
               u16 unkA;
               s32 unkC[2];
               s32 unk14[4];
               Vec2_32 qPos;
               Vec2_32 qUnk2C[2];
               Vec2_32 qUnk3C[4];
               Sprite2 s;
               Sprite2 s2;
} HariisenProj;
```

```c
typedef struct Stack_806152C {
    Vec2_32 unk4;
    Vec2_16 unk8;
    u16 *unkC[2];
} Stack_806152C;
```

```c
typedef struct {
               s16 window;
               s16 flags;
               s16 brightness;
               s16 speed;
               s16 bldCnt;
               s16 bldAlpha;
} ScreenFade;
```

```c
typedef u32 (*MidiKeyToCgbFreqFunc)(u8, u8, u8);
```

```c
typedef struct {
               u8 filler0[7];
               u8 unk7;
               u8 unk8;
               u8 unk9;
               u8 fillerA[0x2];
               u32 unkC[4];
               u16 unk1C[4][6];
               u8 unk4C;
               u8 unk4D;
               u8 filler4E[0x4];
               u16 unk52;
               u8 unk54;
               u8 unk55;
               u8 unk56;
} Struct_03001060;
```

```c
typedef struct Strc3001CFC_sub {
    s32 unk0;
    s32 unk4;
    s16 unk8;
    s16 unkA;
    u16 unkC;
    u8 fillerE[0x6];
} Strc3001CFC_sub;
```

```c
typedef struct Strc3001CFC {
    Sprite s;
    Strc3001CFC_sub unk28[32];
    u8 filler2A8[0x8];
    u8 unk2B0;
} Strc3001CFC;
```

```c
typedef u16 collPxDim_t;
```

```c
typedef u16 collPxDim_t;
```

```c
typedef u32 collPxDim_t;
```

```c
typedef u32 collPxDim_t;
```

```c
typedef struct Collision {
    /* 0x00 */ const s8 *height_map;
    /* 0x04 */ const u8 *tile_rotation;
    /* 0x08 */ const u16 *metatiles;
    /* 0x0C */ const MetatileIndexType *map[MAP_LAYER_COUNT];
    /* 0x14 */ const u16 *flags;
    /* 0x18 */ u16 levelX, levelY;
    /* 0x1C */ collPxDim_t pxWidth, pxHeight;

    // unk20/unk22 are not in SA1
} Collision;
```

```c
typedef u16 TaskPtr;
```

```c
typedef u16 TaskPtr;
```

```c
typedef u32 TaskPtr32;
```

```c
typedef u32 TaskPtr32;
```

```c
typedef u16 IwramData;
```

```c
typedef u16 IwramData;
```

```c
typedef TaskPtr TaskPtr32;
```

```c
typedef TaskPtr TaskPtr32;
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

```c
typedef u16 IwramNodePtr;
```

```c
typedef u16 IwramNodePtr;
```

```c
typedef u32 IwramNodePtr32;
```

```c
typedef u32 IwramNodePtr32;
```

```c
typedef IwramNodePtr IwramNodePtr32;
```

```c
typedef IwramNodePtr IwramNodePtr32;
```

```c
typedef struct {
    u16 index : 10;
    u16 xFlip : 1;
    u16 yFlip : 1;
    u16 pal : 4;
} Tile;
```

```c
typedef struct {
    /* 0x00 */ u16 xTiles;
    /* 0x02 */ u16 yTiles;
    /* 0x04 */ u16 animTileSize;
    /* 0x06 */ u8 animFrameCount;
    /* 0x07 */ u8 animDelay;
    /* 0x08 */ const u8 *tiles;
    /* 0x0C */ u32 tilesSize;
    /* 0x10 */ const u16 *palette;
    /* 0x14 */ u16 palOffset;
    /* 0x16 */ u16 palLength;

    // Can be u8* in some instances
    // map = metatiles, when using with non-background map layers
    /* 0x18 */ const u16 *map;
} Tilemap;
```

```c
typedef struct Rect8 {
    /* 0x00 */ s8 left;
    /* 0x01 */ s8 top;
    /* 0x02 */ s8 right;
    /* 0x03 */ s8 bottom;
} Rect8;
```

```c
typedef u16 AnimId;
```

```c
typedef u16 AnimId;
```

```c
typedef struct {
    /* 0x00 */ struct GraphicsData graphics;

    // 'tilesVram' points to tile-index array in VRAM, telling the GBA which tiles
    // to draw on this BG
    //
    // (!!! Data likely different depending on type of Background (Affine vs.
    // Text). !!!)
    //
    // Data-Structure (16 bits): MSB > PPPPYXTTTTTTTTTT < LSB
    // P = Palette Index
    // Y = Y-Flip
    // X = X-Flip
    // T = Tile-Index
    //
    // NOTE: It does NOT point to the tileset!
    /* 0x0C */ u16 *layoutVram;

    // Stage-Map: Metatiles
    // Common Tilemaps: Tilemap-Tiles
    /* 0x10 */ const u16 *layout;

    // Tile-count on each axis
    // - Stage maps: should be 12 (# per metatile)
    // - Common Tilemaps: should be .targetTilesX/Y
    /* 0x14 */ u16 xTiles;
    /* 0x16 */ u16 yTiles;

    /* 0x18 */ u16 unk18;
    /* 0x1A */ u16 unk1A;
    /* 0x1C */ u16 tilemapId;
    /* 0x1E */ u16 unk1E;

    /* 0x20 */ u16 unk20;
    /* 0x22 */ u16 unk22;
    /* 0x24 */ u16 unk24;

    /* Tile-Dimensions for the rendering target */
    /* - Stage maps: DISPLAY_WIDTH/_HEIGHT + 1*TILE_WIDTH */
    /* - Common Tilemaps: full image dimensions */
    /* 0x26 */ u16 targetTilesX;
    /* 0x28 */ u16 targetTilesY;

    /* 0x2A */ u8 paletteOffset;
    /* 0x2B */ u8 animFrameCounter;
    /* 0x2C */ u8 animDelayCounter;

    /* 0x2E */ u16 flags;

    // apparently NOT signed?
    /* 0x30 */ u16 scrollX;
    /* 0x32 */ u16 scrollY;
    /* 0x34 */ u16 prevScrollX;
    /* 0x36 */ u16 prevScrollY;

    /* Only used by stage maps (they are encoded as Tilemaps) */
    /* 0x38 */ const u16 *metatileMap;
    /* 0x3C */ u16 mapWidth;
    /* 0x3E */ u16 mapHeight;
} Background;
```

```c
typedef struct {
#if (ENGINE >= ENGINE_3)
    // In SA3 flip-bits are integrated into the oamIndex.
    // X-Flip: Bit 14
    // Y-Flip: Bit 15
    /* 0x00 */ u16 oamIndex;
#else
    /* 0x00 */ u8 flip;

    // every animation has an associated oamData pointer, oamIndex starts at
    // 0 for every new animation and ends at variantCount-1
    /* 0x01 */ u8 oamIndex;
#endif

    // some sprite frames consist of multiple images (of the same size
    // as GBA's Object Attribute Memory, e.g. 8x8, 8x32, 32x64, ...)
    /* 0x02 */ u16 numSubframes;

    // In pixels
    /* 0x04 */ u16 width;
    // In pixels
    /* 0x06 */ u16 height;

    /* 0x08 */ s16 offsetX;
    /* 0x0A */ s16 offsetY;
} SpriteOffset;
```

```c
typedef struct {
    // index: -1 on init; lower 4 bits = index (in anim-cmds)
    /* 0x00 */ s32 index;
    /* 0x04 */ s8 left;
    /* 0x05 */ s8 top;
    /* 0x06 */ s8 right;
    /* 0x07 */ s8 bottom;
} HitboxOld;
```

```c
typedef struct {
    // index: -1 on init; lower 4 bits = index (in anim-cmds)
    /* 0x00 */ s32 index;
    /* 0x04 */ Rect8 b;
} Hitbox;
```

```c
typedef struct {
    /* 0x00 */ u8 *tiles; // in VRAM
    /* 0x04 */ u32 frameNum;

    // Bitfield description from KATAM decomp
    /* 0x08 */ u32 frameFlags; // bit 0-4: affine-index / rotscale param selection
                               // bit 5: rotscale enable
                               // bit 6: rotscale double-size
                               // bit 7-8: obj mode -- different (1 bit) in SA3?
                               // bit 9
                               // bit 10 X-Flip
                               // bit 11 Y-Flip
                               // bit 12-13: priority
                               // bit 14: Animation finished
                               // bit 15-16: Background ID
                               // bit 17
                               // bit 18
                               // bit 19-25(?)
                               // bit 26
                               // bit 27-29(?)
                               // bit 30
                               // bit 31
    /* 0x0C */ u16 anim;
    /* 0x0E */ u16 animCursor;
    /* 0x10 */ s16 x;
    /* 0x12 */ s16 y;
    /* 0x14 */ s16 oamFlags; // bit 6-10: OAM order index
    /* 0x16 */ s16 qAnimDelay; // Q_8_8, in frames
    /* 0x18 */ u16 prevAnim;
    /* 0x1A */ u8 variant;
    /* 0x1B */ u8 prevVariant;

    // 0x08 = 0.5x, 0x10 = 1.0x, 0x20 = 2.0x ...
    /* 0x1C */ u8 animSpeed;

    /* 0x1D */ u8 oamBaseIndex;
    /* 0x1E */ u8 numSubFrames;
    /* 0x1F */ u8 palId; // (0 - 15)
    /* 0x20 */ Hitbox hitboxes[1];
} Sprite;
```

```c
typedef struct {
    /* 0x00 */ u8 *tiles;
    /* 0x04 */ u32 frameNum;
    /* 0x08 */ u32 frameFlags;
    /* 0x0C */ u16 anim;
    /* 0x0E */ u16 animCursor;
    /* 0x10 */ s16 x;
    /* 0x12 */ s16 y;
    /* 0x14 */ s16 oamFlags;
    /* 0x16 */ s16 qAnimDelay;
    /* 0x18 */ u16 prevAnim;
    /* 0x1A */ u8 variant;
    /* 0x1B */ u8 prevVariant;
    /* 0x1C */ u8 animSpeed;
    /* 0x1D */ u8 oamBaseIndex;
    /* 0x1E */ u8 numSubFrames;
    /* 0x1F */ u8 palId;
    /* 0x20 */ Hitbox hitboxes[2];
} Sprite2;
```

```c
typedef struct {
    /* 0x00 */ u16 rotation;

    // TODO:
    //     Does "scaleX" and "scaleY" fit as names?
    //     It's 0x100 or Q_8_8(1.0) for 1x, Q_8_8(2.0) for 2x, etc.
    /* 0x02 */ s16 qScaleX;
    /* 0x04 */ s16 qScaleY;
    /* 0x06 */ s16 x;
    /* 0x08 */ s16 y;
} SpriteTransform;
```

```c
typedef struct {
    /* 0x00 */ s16 unk0[4];
    /* 0x08 */ s16 qDirX;
    /* 0x0A */ s16 qDirY;

    /* 0x0C */ s16 unkC[2];

    /* 0x10 */ s32 posX;
    /* 0x14 */ s32 posY;

    /* 0x18 */ s16 unk18[2][2];
    /* 0x20 */ u16 affineIndex;
} UnkSpriteStruct;
```

```c
typedef struct {
    /* 0x00 */ u32 numTiles;
    /* 0x04 */ AnimId anim;
    /* 0x06 */ u8 variant;
} TileInfo;
```

```c
typedef struct {
    /* 0x00 */ AnimId anim;
    /* 0x02 */ u8 variant;
    /* 0x04 */ u32 numTiles;
} TileInfo2;
```

```c
typedef struct PACKED {
    /* 0x00 */ u16 numTiles;
    /* 0x02 */ AnimId anim;
    /* 0x04 */ u16 variant;
} TileInfo_16;
```

```c
typedef enum {
    ACMD_RESULT__ANIM_CHANGED = -1,
    ACMD_RESULT__ENDED = 0,
    ACMD_RESULT__RUNNING = +1,
} AnimCmdResult;
```

```c
typedef struct {
    u8 unk0;
    u8 unk1;
    u8 unk2;
    u8 unk3;
    u8 unk4;
    u8 unk5;
    u8 unk6;
    u8 unk7;
} TriParam1;
```

```c
typedef uint32_t winreg_t;
```

```c
typedef uint16_t winreg_t;
```

```c
typedef struct {
    /* 0x00 */ u8 filler0[7];
    /* 0x4C */ u8 unk7;
    /* 0x4C */ u8 unk8;
    /* 0x4C */ u8 unk9;
    /* 0x00 */ u8 fillerA[0x2];
    /* 0x4C */ u32 unkC[4];
    /* 0x00 */ u16 unk1C[4][6];
    /* 0x4C */ u8 unk4C;
    /* 0x4D */ u8 unk4D;
    /* 0x4E */ u8 filler4E[0x4];
    /* 0x52 */ u16 unk52;
    /* 0x54 */ u8 unk54;
    /* 0x55 */ u8 unk55; // used to determine item type in MP itemboxes (15 + (unk55 & 0x1))
    /* 0x56 */ u8 unk56;
} Struct_03001060;
```

```c
typedef struct Strc3001CFC_sub {
    s32 unk0;
    s32 unk4;
    s16 unk8;
    s16 unkA;
    u16 unkC;
    u8 fillerE[0x6];
} Strc3001CFC_sub;
```

```c
typedef struct Strc3001CFC {
    Sprite s;
    Strc3001CFC_sub unk28[32];
    u8 filler2A8[0x8];
    u8 unk2B0;
} Strc3001CFC;
```

```c
typedef struct {
    u32 srcLength : 16; // in bytes
    u32 srcWidth : 8; // in bits
    u32 dstWidth : 8; // in bits
} BitUnPackData;
```

```c
typedef u32 (*MidiKeyToCgbFreqFunc)(u8, u8, u8);
```

```c
typedef uint8_t   u8;
```

```c
typedef uint16_t u16;
```

```c
typedef uint32_t u32;
```

```c
typedef uint64_t u64;
```

```c
typedef int8_t    s8;
```

```c
typedef int16_t  s16;
```

```c
typedef int32_t  s32;
```

```c
typedef int64_t  s64;
```

```c
typedef u8 MetatileIndexType;
```

```c
typedef u8 MetatileIndexType;
```

```c
typedef u16 MetatileIndexType;
```

```c
typedef u16 MetatileIndexType;
```

```c
typedef u16 int_vcount;
```

```c
typedef u16 int_vcount;
```

```c
typedef u8 int_vcount;
```

```c
typedef u8 int_vcount;
```

```c
typedef volatile u8   vu8;
```

```c
typedef volatile u8   vu8;
```

```c
typedef volatile u16 vu16;
```

```c
typedef volatile u16 vu16;
```

```c
typedef volatile u32 vu32;
```

```c
typedef volatile u32 vu32;
```

```c
typedef volatile u64 vu64;
```

```c
typedef volatile u64 vu64;
```

```c
typedef volatile s8   vs8;
```

```c
typedef volatile s8   vs8;
```

```c
typedef volatile s16 vs16;
```

```c
typedef volatile s16 vs16;
```

```c
typedef volatile s32 vs32;
```

```c
typedef volatile s32 vs32;
```

```c
typedef volatile s64 vs64;
```

```c
typedef volatile s64 vs64;
```

```c
typedef float  f32;
```

```c
typedef double f64;
```

```c
typedef u8  bool8;
```

```c
typedef u8  bool8;
```

```c
typedef u16 bool16;
```

```c
typedef u16 bool16;
```

```c
typedef u32 bool32;
```

```c
typedef u32 bool32;
```

```c
typedef volatile struct BgCnt vBgCnt;
```

```c
typedef union {
    struct {
    /*0x00*/ u32 y:8;
    /*0x01*/ u32 affineMode:2;  // 0x100, 0x200 -> 0x400
             u32 objMode:2;     // 0x400, 0x800 -> 0xC00
             u32 mosaic:1;      // 0x1000
             u32 bpp:1;         // 0x2000
             u32 shape:2;       // 0x4000, 0x8000 -> 0xC000

    /*0x02*/ u32 x:9;
             u32 matrixNum:5;   // bits 3/4 are h-flip/v-flip if not in affine mode
             u32 size:2;        // 0x4000, 0x8000 -> 0xC000

    /*0x04*/ u16 tileNum:10;    // 0x3FF
             u16 priority:2;    // 0x400, 0x800 -> 0xC00
             u16 paletteNum:4;

    /*0x06*/ u16 fractional:8;
             u16 integer:7;
             u16 sign:1;
    } split;

    struct {
        u16 attr0;
        u16 attr1;
        u16 attr2;
        u16 affineParam;
    } all;

    u16 raw[4];
} OamData;
```

```c
typedef union {
    struct {
    /* 0x00 */ s16 x;
    /* 0x02 */ s16 y;

    /* 0x04 */ u32 affineMode:2;  // 0x1, 0x2 -> 0x4
             u32 objMode:2;     // 0x4, 0x8 -> 0xC
             u32 mosaic:1;      // 0x10
             u32 bpp:1;         // 0x20
             u32 shape:2;       // 0x40, 0x80 -> 0xC0

    /* 0x05 */ u32 matrixNum:5;   // bits 3/4 are h-flip/v-flip if not in affine mode
               u32 size:2;        // 0x4000, 0x8000 -> 0xC000
               u32 padding:17; // NOTE: Padding MUST be here for some platforms not to break

    /* 0x08 */ u16 tileNum:10;    // 0x3FF
             u16 priority:2;    // 0x400, 0x800 -> 0xC00
             u16 paletteNum:4;

    /* 0x0A */ u16 fractional:8;
             u16 integer:7;
             u16 sign:1;
    } split;

    struct {
        s16 x;
        s16 y;
        u16 attr0;
        u16 attr1;
        u16 attr2;
        u16 affineParam;
    } all;

    u16 raw[6];
} OamData;
```

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ bool32 unk4;
    /* 0x08 */ s8 meX;
    /* 0x20 */ u8 filler9[0x3];

    // TODO: Make this Vec2_u16
    /* 0x0C */ u16 regionX;
    /* 0x0E */ u16 regionY;

    // TODO: Make this Vec2_32
    /* 0x10 */ s32 posX;
    /* 0x14 */ s32 posY;

    /* 0x18 */ s32 unk18;
    /* 0x1C */ Sprite *spr; // TODO: might be (Sprite2 *)?
    /* 0x20 */ u8 filler20[0x8];
} EnemyUnknownStruc0;
```

```c
typedef struct {
    /* 0x00 */ SpriteBase base;
    /* 0x0C */ s32 qWorldX;
    /* 0x10 */ s32 qWorldY;
    /* 0x14 */ s32 qHalfHeight;
    /* 0x18 */ s32 qHalfWidth;
    /* 0x1C */ s32 qMiddleX;
    /* 0x20 */ s32 qMiddleY;
    /* 0x24 */ s16 somePosX;
    /* 0x26 */ s16 somePosY;
    /* 0x28 */ u16 unk28;
    /* 0x2A */ u8 unk2A;
    /* 0x2B */ u8 kind;
} PlatformShared;
```

# Primary Objective

Decompile the following target assembly function from `asm/code_0_2.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
	thumb_func_start sub_8028850
sub_8028850: @ 0x08028850
	push {r4, r5, r6, lr}
	sub sp, #4
	ldr r0, _080288C8 @ =Task_80288F0
	ldr r1, _080288CC @ =0x00000494
	movs r2, #0x80
	lsls r2, r2, #5
	movs r6, #0
	str r6, [sp]
	movs r3, #0
	bl TaskCreate
	ldrh r4, [r0, #6]
	movs r5, #0xc0
	lsls r5, r5, #0x12
	adds r5, r4, r5
	ldr r1, _080288D0 @ =0x03000488
	adds r0, r4, r1
	movs r2, #0
	strh r6, [r0]
	ldr r0, _080288D4 @ =0x0300048A
	adds r1, r4, r0
	movs r0, #1
	strb r0, [r1]
	ldr r1, _080288D8 @ =0x0300048B
	adds r0, r4, r1
	strb r2, [r0]
	adds r1, #1
	adds r0, r4, r1
	strb r2, [r0]
	adds r1, #1
	adds r0, r4, r1
	strb r2, [r0]
	bl sub_80293BC
	ldr r1, _080288DC @ =0x03000492
	adds r4, r4, r1
	strb r0, [r4]
	adds r0, r5, #0
	bl sub_8028DEC
	bl m4aMPlayAllStop
	ldr r0, _080288E0 @ =0x00000323
	bl m4aSongNumStart
	movs r0, #0xa0
	lsls r0, r0, #0x13
	strh r6, [r0]
	ldr r0, _080288E4 @ =gBgPalette
	strh r6, [r0]
	ldr r2, _080288E8 @ =gDispCnt
	ldrh r1, [r2]
	ldr r0, _080288EC @ =0x0000FEFF
	ands r0, r1
	strh r0, [r2]
	add sp, #4
	pop {r4, r5, r6}
	pop {r0}
	bx r0
	.align 2, 0
_080288C8: .4byte Task_80288F0
_080288CC: .4byte 0x00000494
_080288D0: .4byte 0x03000488
_080288D4: .4byte 0x0300048A
_080288D8: .4byte 0x0300048B
_080288DC: .4byte 0x03000492
_080288E0: .4byte 0x00000323
_080288E4: .4byte gBgPalette
_080288E8: .4byte gDispCnt
_080288EC: .4byte 0x0000FEFF

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
