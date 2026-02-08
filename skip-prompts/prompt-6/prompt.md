You are decompiling an assembly function called `sub_80A52DC` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `Task_806394C`

```c
void Task_806394C(void)
{
    Marun *enemy = TASK_DATA(gCurTask);
    s8 res = 0;
    s32 x, y;
    s32 r1;
    s32 r0;

    sub_8063BB8(enemy);

    x = I(enemy->qPos.x);
    y = I(enemy->qPos.y);

    x = TO_WORLD_POS_RAW(x, enemy->region[0]);
    y = TO_WORLD_POS_RAW(y, enemy->region[1]);

    if (enemy->direction > 0) {
        res = sub_8052394(x, y - 8, 1, -8, 0, sub_805203C);

        if (res < 0) {
            enemy->qPos.x -= Q(res);
            enemy->qPos.x += Q(8);

            enemy->unk4 = 1;
            enemy->speed = 0;
        }
    } else {
        res = sub_8052394(x + 8, y - 8, 1, 8, 0, sub_805203C);

        if (res < 0) {
            enemy->qPos.x += Q(res);
            enemy->qPos.x -= Q(8);

            enemy->unk4 = 1;
            enemy->speed = 0;
        }
    }

    if ((gStageData.unk4 != 1 && gStageData.unk4 != 2 && gStageData.unk4 != 4)) {
        if (++enemy->timer > ZONE_TIME_TO_INT(0, 6) || res < 0) {
            Sprite *s = &enemy->s;

            s->anim = gUnknown_080D210C[3].anim;
            s->variant = gUnknown_080D210C[3].variant;
            s->prevVariant = 0xFF;

            CpuFill16(0, &enemy->s.hitboxes[1].b, sizeof(Rect8));
            CpuFill16(0, &enemy->s.hitboxes[0].b, sizeof(Rect8));

            s->frameFlags = SPRITE_FLAG(PRIORITY, 1);

            if (enemy->direction < 0) {
                SPRITE_FLAG_SET(s, X_FLIP);
            }

            if (enemy->direction > 0) {
                enemy->qPos.x += Q(19);
            } else {
                enemy->qPos.x += Q(13);
            }

            UpdateSpriteAnimation(s);

            enemy->rotation = 0;
            enemy->timer = 0;
            enemy->speed = Q(2);
            enemy->unk18 = 0;
            enemy->unk8 = FALSE;
            enemy->unk5 = 1;

            gCurTask->main = Task_8063ADC;
            return;
        }
    }

    if (sub_8063D38(enemy) == TRUE) {
        TaskDestroy(gCurTask);
    } else {
        sub_8063E5C(enemy);
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
sub sp, sp, #0xc
ldr r0, [pc, #0x58] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r1, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r5, r1, r0
mov r4, #0x0
mov r0, r5
bl sub_8063BB8-0x4
ldr r0, [r5, #0x24]
asr r2, r0, #0x8
ldr r0, [r5, #0x28]
asr r1, r0, #0x8
ldrh r0, [r5, #0xc]
lsl r0, r0, #0x8
add r2, r2, r0
ldrh r0, [r5, #0xe]
lsl r0, r0, #0x8
add r1, r1, r0
mov r0, #0xa
ldrsb r0, [r5, r0]
cmp r0, #0x0
ble .L68
sub r1, #0x8
mov r3, #0x8
neg r3, r3
str r4, [sp, #0x0]
ldr r0, [pc, #0x24] @ =sub_805203C
str r0, [sp, #0x4]
mov r0, r2
mov r2, #0x1
bl sub_8052394-0x4
lsl r0, r0, #0x18
lsr r4, r0, #0x18
asr r0, r0, #0x18
cmp r0, #0x0
bge .L9a
lsl r1, r0, #0x8
ldr r0, [r5, #0x24]
sub r0, r0, r1
mov r1, #0x80
lsl r1, r1, #0x4
b .L8e
.hword #0x0
.word gCurTask
.word sub_805203C
.L68:
mov r0, r2
add r0, #0x8
sub r1, #0x8
str r4, [sp, #0x0]
ldr r2, [pc, #0xa8] @ =sub_805203C
str r2, [sp, #0x4]
mov r2, #0x1
mov r3, #0x8
bl sub_8052394-0x4
lsl r0, r0, #0x18
lsr r4, r0, #0x18
asr r0, r0, #0x18
cmp r0, #0x0
bge .L9a
lsl r1, r0, #0x8
ldr r0, [r5, #0x24]
add r0, r0, r1
ldr r1, [pc, #0x90] @ =#0xfffff800
.L8e:
add r0, r0, r1
str r0, [r5, #0x24]
mov r0, #0x1
strb r0, [r5, #0x4]
mov r0, #0x0
str r0, [r5, #0x14]
.L9a:
ldr r0, [pc, #0x88] @ =gStageData
ldrb r1, [r0, #0x4]
subs r0, r1, #0x1
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0x1
bls .L168
cmp r1, #0x4
beq .L168
ldrh r0, [r5, #0x12]
add r0, #0x1
mov r7, #0x0
strh r0, [r5, #0x12]
lsl r0, r0, #0x10
mov r1, #0xb4
lsl r1, r1, #0x11
cmp r0, r1
bgt .Lc4
lsl r0, r4, #0x18
cmp r0, #0x0
bge .L168
.Lc4:
mov r6, r5
add r6, #0x38
ldr r1, [pc, #0x5c] @ =gUnknown_080D210C
ldrh r0, [r1, #0x18]
strh r0, [r6, #0xc]
ldrb r0, [r1, #0x1a]
strb r0, [r6, #0x1a]
mov r0, #0xff
strb r0, [r6, #0x1b]
add r0, sp, #0x8
strh r7, [r0, #0x0]
mov r1, r5
add r1, #0x64
ldr r4, [pc, #0x4c] @ =#0x1000002
mov r2, r4
bl CpuSet-0x4
mov r0, sp
add r0, #0xa
strh r7, [r0, #0x0]
mov r1, r5
add r1, #0x5c
mov r2, r4
bl CpuSet-0x4
mov r1, #0x80
lsl r1, r1, #0x5
str r1, [r6, #0x8]
mov r0, #0xa
ldrsb r0, [r5, r0]
cmp r0, #0x0
bge .L10c
mov r0, #0x80
lsl r0, r0, #0x3
orr r0, r1
str r0, [r6, #0x8]
.L10c:
mov r0, #0xa
ldrsb r0, [r5, r0]
cmp r0, #0x0
ble .L130
ldr r0, [r5, #0x24]
mov r1, #0x98
lsl r1, r1, #0x5
b .L136
.word sub_805203C
.word #0xfffff800
.word gStageData
.word gUnknown_080D210C
.word #0x1000002
.L130:
ldr r0, [r5, #0x24]
mov r1, #0xd0
lsl r1, r1, #0x4
.L136:
add r0, r0, r1
str r0, [r5, #0x24]
mov r0, r6
bl UpdateSpriteAnimation-0x4
mov r2, #0x0
mov r1, #0x0
strh r1, [r5, #0x10]
strh r1, [r5, #0x12]
mov r0, #0x80
lsl r0, r0, #0x2
str r0, [r5, #0x14]
str r1, [r5, #0x18]
strb r2, [r5, #0x8]
mov r0, #0x1
strb r0, [r5, #0x5]
ldr r0, [pc, #0x8] @ =gCurTask
ldr r1, [r0, #0x0]
ldr r0, [pc, #0x8] @ =Task_8063ADC
str r0, [r1, #0x8]
b .L186
.word gCurTask
.word Task_8063ADC
.L168:
mov r0, r5
bl sub_8063D38-0x4
cmp r0, #0x1
bne .L180
ldr r0, [pc, #0x8] @ =gCurTask
ldr r0, [r0, #0x0]
bl TaskDestroy-0x4
b .L186
.word gCurTask
.L180:
mov r0, r5
bl sub_8063E5C-0x4
.L186:
add sp, #0xc
pop {r4, r5, r6, r7}
pop {r0}
bx r0
```

## `Task_MarunInit`

```c
void Task_MarunInit(void)
{
    Marun *enemy = TASK_DATA(gCurTask);

    sub_805CD70(&enemy->qPos, &enemy->qUnk1C, enemy->region, &enemy->unk9);

    if ((gStageData.unk4 != 1) && (gStageData.unk4 != 2) && (gStageData.unk4 != 4)) {
        bool32 result = sub_8063C98(enemy);

        if ((result == TRUE) && ((enemy->unk4 == 0) && (enemy->unk5 == 0))) {
            Sprite *sprite = &enemy->s;

            sprite->anim = gUnknown_080D210C[1].anim;
            sprite->variant = gUnknown_080D210C[1].variant;
            sprite->prevVariant = 0xFF;

            CpuFill16(0, &enemy->s.hitboxes[1].b, sizeof(Rect8));
            CpuFill16(0, &enemy->s.hitboxes[0].b, sizeof(Rect8));

            UpdateSpriteAnimation(sprite);

            enemy->unk8 = result;
            gCurTask->main = Task_8063858;
            return;
        }
    }

    if (sub_8063D38(enemy) == TRUE) {
        TaskDestroy(gCurTask);
        return;
    }

    sub_8063E5C(enemy);
}
```

```asm
push {r4, r5, r6, r7, lr}
mov r7, r10
mov r6, r9
mov r5, r8
push {r5, r6, r7}
sub sp, sp, #0x4
ldr r0, [pc, #0x90] @ =gCurTask
mov r10, r0
ldr r0, [r0, #0x0]
ldrh r6, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r0, r0, r6
mov r8, r0
ldr r1, [pc, #0x84] @ =#0x3000024
add r0, r6, r1
ldr r2, [pc, #0x84] @ =#0x300001c
add r1, r6, r2
ldr r3, [pc, #0x84] @ =#0x300000c
add r2, r6, r3
ldr r4, [pc, #0x84] @ =#0x3000009
add r3, r6, r4
bl sub_805CD70-0x4
ldr r0, [pc, #0x80] @ =gStageData
ldrb r1, [r0, #0x4]
subs r0, r1, #0x1
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0x1
bls .Ld0
cmp r1, #0x4
beq .Ld0
mov r0, r8
bl sub_8063C98-0x4
mov r9, r0
cmp r0, #0x1
bne .Ld0
mov r0, r8
ldrh r7, [r0, #0x4]
cmp r7, #0x0
bne .Ld0
ldr r1, [pc, #0x60] @ =#0x3000038
add r4, r6, r1
ldr r1, [pc, #0x60] @ =gUnknown_080D210C
ldrh r0, [r1, #0x8]
strh r0, [r4, #0xc]
ldrb r0, [r1, #0xa]
strb r0, [r4, #0x1a]
mov r0, #0xff
strb r0, [r4, #0x1b]
mov r0, sp
strh r7, [r0, #0x0]
ldr r2, [pc, #0x50] @ =#0x3000064
add r1, r6, r2
ldr r5, [pc, #0x50] @ =#0x1000002
mov r2, r5
bl CpuSet-0x4
mov r0, sp
add r0, #0x2
strh r7, [r0, #0x0]
ldr r3, [pc, #0x48] @ =#0x300005c
add r1, r6, r3
mov r2, r5
bl CpuSet-0x4
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r0, r9
mov r4, r8
strb r0, [r4, #0x8]
mov r2, r10
ldr r1, [r2, #0x0]
ldr r0, [pc, #0x30] @ =Task_8063858
str r0, [r1, #0x8]
b .Lee
.hword #0x0
.word gCurTask
.word #0x3000024
.word #0x300001c
.word #0x300000c
.word #0x3000009
.word gStageData
.word #0x3000038
.word gUnknown_080D210C
.word #0x3000064
.word #0x1000002
.word #0x300005c
.word Task_8063858
.Ld0:
mov r0, r8
bl sub_8063D38-0x4
cmp r0, #0x1
bne .Le8
ldr r0, [pc, #0x8] @ =gCurTask
ldr r0, [r0, #0x0]
bl TaskDestroy-0x4
b .Lee
.word gCurTask
.Le8:
mov r0, r8
bl sub_8063E5C-0x4
.Lee:
add sp, #0x4
pop {r3, r4, r5}
mov r8, r3
mov r9, r4
mov r10, r5
pop {r4, r5, r6, r7}
pop {r0}
bx r0
```

## `Task_8063858`

```c
void Task_8063858(void)
{
    Marun *enemy = TASK_DATA(gCurTask);

    sub_805CD70(&enemy->qPos, &enemy->qUnk1C, enemy->region, &enemy->unk9);

    if (gStageData.unk4 != 1 && gStageData.unk4 != 2 && gStageData.unk4 != 4 && sub_8063E5C(enemy) == 0) {
        Sprite *sprite = &enemy->s;
        sprite->anim = gUnknown_080D210C[2].anim;
        sprite->variant = gUnknown_080D210C[2].variant;
        sprite->prevVariant = 0xFF;
        sprite->frameFlags |= SPRITE_FLAG(ROT_SCALE_ENABLE, 1) | SPRITE_FLAG(ROT_SCALE_DOUBLE_SIZE, 1) | SPRITE_FLAG(ROT_SCALE, 10);

        enemy->qPos.x -= Q(16);

        CpuFill16(0, &enemy->s.hitboxes[1].b, sizeof(Rect8));
        CpuFill16(0, &enemy->s.hitboxes[0].b, sizeof(Rect8));

        UpdateSpriteAnimation(sprite);

        gCurTask->main = Task_806394C;
    } else if (sub_8063D38(enemy) == TRUE) {
        TaskDestroy(gCurTask);
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
mov r7, r8
push {r7}
sub sp, sp, #0x4
ldr r0, [pc, #0x90] @ =gCurTask
mov r8, r0
ldr r0, [r0, #0x0]
ldrh r6, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r5, r6, r0
ldr r1, [pc, #0x88] @ =#0x3000024
add r0, r6, r1
ldr r2, [pc, #0x88] @ =#0x300001c
add r1, r6, r2
ldr r3, [pc, #0x88] @ =#0x300000c
add r2, r6, r3
ldr r4, [pc, #0x88] @ =#0x3000009
add r3, r6, r4
bl sub_805CD70-0x4
ldr r0, [pc, #0x84] @ =gStageData
ldrb r1, [r0, #0x4]
subs r0, r1, #0x1
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0x1
bls .Ld0
cmp r1, #0x4
beq .Ld0
mov r0, r5
bl sub_8063E5C-0x4
mov r7, r0
cmp r7, #0x0
bne .Ld0
ldr r0, [pc, #0x68] @ =#0x3000038
add r4, r6, r0
ldr r1, [pc, #0x68] @ =gUnknown_080D210C
ldrh r0, [r1, #0x10]
strh r0, [r4, #0xc]
ldrb r0, [r1, #0x12]
strb r0, [r4, #0x1a]
mov r0, #0xff
strb r0, [r4, #0x1b]
ldr r0, [r4, #0x8]
mov r1, #0x6a
orr r0, r1
str r0, [r4, #0x8]
ldr r0, [r5, #0x24]
ldr r1, [pc, #0x54] @ =#0xfffff000
add r0, r0, r1
str r0, [r5, #0x24]
mov r0, sp
strh r7, [r0, #0x0]
ldr r2, [pc, #0x50] @ =#0x3000064
add r1, r6, r2
ldr r5, [pc, #0x50] @ =#0x1000002
mov r2, r5
bl CpuSet-0x4
mov r0, sp
add r0, #0x2
strh r7, [r0, #0x0]
ldr r3, [pc, #0x44] @ =#0x300005c
add r1, r6, r3
mov r2, r5
bl CpuSet-0x4
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r4, r8
ldr r1, [r4, #0x0]
ldr r0, [pc, #0x34] @ =Task_806394C
str r0, [r1, #0x8]
b .Le2
.hword #0x0
.word gCurTask
.word #0x3000024
.word #0x300001c
.word #0x300000c
.word #0x3000009
.word gStageData
.word #0x3000038
.word gUnknown_080D210C
.word #0xfffff000
.word #0x3000064
.word #0x1000002
.word #0x300005c
.word Task_806394C
.Ld0:
mov r0, r5
bl sub_8063D38-0x4
cmp r0, #0x1
bne .Le2
ldr r0, [pc, #0x14] @ =gCurTask
ldr r0, [r0, #0x0]
bl TaskDestroy-0x4
.Le2:
add sp, #0x4
pop {r3}
mov r8, r3
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
```

## `Task_GekoGeko0`

```c
static void Task_GekoGeko0(void)
{
    GekoGeko *enemy = TASK_DATA(gCurTask);
    AnimCmdResult acmdRes;

    sub_805CD70(&enemy->qPos, 0, enemy->region, &enemy->unk8);

    if (sub_8059CB0(enemy) == TRUE) {
        TaskDestroy(gCurTask);
        return;
    }

    acmdRes = sub_8059C3C(enemy);

    if (gStageData.unk4 != 1 && gStageData.unk4 != 2 && gStageData.unk4 != 4) {
        if (acmdRes == ACMD_RESULT__ENDED) {
            if ((unsigned)++enemy->unk7 > 60) {
                enemy->unk12 = 0;
                enemy->unk6 = 0;
                enemy->unk7 = 0;
                enemy->s.prevVariant = -1;
            }
        } else {
            UpdatePosition(enemy);
        }

        if (acmdRes == ACMD_RESULT__ENDED) {
            Sprite *s = &enemy->s;

            if (((enemy->qLeft >= enemy->qPos.x) && !(s->frameFlags & SPRITE_FLAG_MASK_X_FLIP))
                || ((enemy->qRight <= enemy->qPos.x) && (s->frameFlags & SPRITE_FLAG_MASK_X_FLIP))) {
                s->anim = sTileInfoGekoGeko[1].anim;
                s->variant = sTileInfoGekoGeko[1].variant;
                gCurTask->main = Task_GekoGeko1;
            } else if ((sub_8059AE8(enemy) == TRUE) && (enemy->unk6 == 0)) {
                s->anim = sTileInfoGekoGeko[2].anim;
                s->variant = sTileInfoGekoGeko[2].variant;
                gCurTask->main = Task_GekoGeko2;
            }
        }
    }
}
```

```asm
push {r4, r5, r6, lr}
ldr r6, [pc, #0x30] @ =gCurTask
ldr r0, [r6, #0x0]
ldrh r5, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r4, r5, r0
ldr r1, [pc, #0x28] @ =#0x300001c
add r0, r5, r1
sub r1, #0x10
add r2, r5, r1
sub r1, #0x4
add r3, r5, r1
mov r1, #0x0
bl sub_805CD70-0x4
mov r0, r4
bl .L34c
cmp r0, #0x1
bne .L3c
ldr r0, [r6, #0x0]
bl TaskDestroy-0x4
b .Lfa
.hword #0x0
.word gCurTask
.word #0x300001c
.L3c:
mov r0, r4
bl .L2d8
mov r6, r0
ldr r0, [pc, #0x34] @ =gStageData
ldrb r1, [r0, #0x4]
subs r0, r1, #0x1
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0x1
bls .Lfa
cmp r1, #0x4
beq .Lfa
cmp r6, #0x0
bne .L84
ldrb r0, [r4, #0x7]
add r0, #0x1
strb r0, [r4, #0x7]
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0x3c
bls .L8a
mov r0, #0x0
strh r6, [r4, #0x12]
strb r0, [r4, #0x6]
strb r0, [r4, #0x7]
ldr r0, [pc, #0xc] @ =#0x3000047
add r1, r5, r0
mov r0, #0xff
strb r0, [r1, #0x0]
b .L8a
.hword #0x0
.word gStageData
.word #0x3000047
.L84:
mov r0, r4
bl .L2b0
.L8a:
cmp r6, #0x0
bne .Lfa
mov r5, r4
add r5, #0x2c
ldr r0, [r4, #0x24]
ldr r2, [r4, #0x1c]
cmp r0, r2
blt .La6
ldr r0, [r5, #0x8]
mov r1, #0x80
lsl r1, r1, #0x3
and r0, r1
cmp r0, #0x0
beq .Lb8
.La6:
ldr r0, [r4, #0x28]
cmp r0, r2
bgt .Ld8
ldr r0, [r5, #0x8]
mov r1, #0x80
lsl r1, r1, #0x3
and r0, r1
cmp r0, #0x0
beq .Ld8
.Lb8:
ldr r1, [pc, #0x10] @ =sTileInfoGekoGeko
ldrh r0, [r1, #0x8]
strh r0, [r5, #0xc]
ldrb r0, [r1, #0xa]
strb r0, [r5, #0x1a]
ldr r0, [pc, #0xc] @ =gCurTask
ldr r1, [r0, #0x0]
ldr r0, [pc, #0xc] @ =Task_GekoGeko1
b .Lf8
.hword #0x0
.word sTileInfoGekoGeko
.word gCurTask
.word Task_GekoGeko1
.Ld8:
mov r0, r4
bl .L184
cmp r0, #0x1
bne .Lfa
ldrb r0, [r4, #0x6]
cmp r0, #0x0
bne .Lfa
ldr r1, [pc, #0x14] @ =sTileInfoGekoGeko
ldrh r0, [r1, #0x10]
strh r0, [r5, #0xc]
ldrb r0, [r1, #0x12]
strb r0, [r5, #0x1a]
ldr r0, [pc, #0x10] @ =gCurTask
ldr r1, [r0, #0x0]
ldr r0, [pc, #0x10] @ =Task_GekoGeko2
.Lf8:
str r0, [r1, #0x8]
.Lfa:
pop {r4, r5, r6}
pop {r0}
bx r0
.word sTileInfoGekoGeko
.word gCurTask
.word Task_GekoGeko2
```

## `sub_8037828`

```c
void sub_8037828(void)
{
    DecoRock *deco = TASK_DATA(gCurTask);
    Sprite *s = &deco->s;
    MapEntity *me = deco->base.me;
    s16 worldX, worldY;
    s32 res;
    u8 i;

    worldX = TO_WORLD_POS(deco->base.meX, deco->base.regionX);
    worldY = TO_WORLD_POS(me->y, deco->base.regionY);

    s->x = worldX - gCamera.x;
    s->y = worldY - gCamera.y;

    if (IS_OUT_OF_CAM_RANGE(s->x, s->y)) {
        SET_MAP_ENTITY_NOT_INITIALIZED(me, deco->base.meX);
        TaskDestroy(gCurTask);
        return;
    }

    for (i = 0; i < 4; i++) {
        switch (i) {
            case 0: {
                s = &deco->s2;
            } break;

            case 1: {
                s = &deco->s3;
            } break;

            case 2: {
                s = &deco->s3;
            } break;

            case 3: {
                s = &deco->s2;
            } break;
        }

        deco->qUnkA8[i][1] += Q(0.5);

        deco->qPositions[i].x += deco->qUnkA8[i][0];
        deco->qPositions[i].y += deco->qUnkA8[i][1];

        res = sub_8052418(I(deco->qPositions[i].y), I(deco->qPositions[i].x), 1, +8, sub_8051F54);

        if (res < 0) {
            deco->qPositions[i].y += Q(res);
            deco->qUnkA8[i][0] = +(deco->qUnkA8[i][0] * 3) >> 2;
            deco->qUnkA8[i][1] = -(deco->qUnkA8[i][1] * 3) >> 2;
        }

        s->x = I(deco->qPositions[i].x) - gCamera.x;
        s->y = I(deco->qPositions[i].y) - gCamera.y;
        UpdateSpriteAnimation(s);
        DisplaySprite(s);
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
mov r7, r10
mov r6, r9
mov r5, r8
push {r5, r6, r7}
sub sp, sp, #0x14
ldr r4, [pc, #0x74] @ =gCurTask
ldr r0, [r4, #0x0]
ldrh r5, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r0, r0, r5
mov r10, r0
ldr r0, [pc, #0x6c] @ =#0x300000c
add r0, r0, r5
mov r8, r0
mov r1, r10
ldr r6, [r1, #0x0]
ldrb r1, [r1, #0xa]
lsl r1, r1, #0x3
mov r2, r10
ldrh r0, [r2, #0x4]
lsl r0, r0, #0x8
add r1, r1, r0
ldrb r2, [r6, #0x1]
lsl r2, r2, #0x3
mov r3, r10
ldrh r0, [r3, #0x6]
lsl r0, r0, #0x8
add r2, r2, r0
ldr r3, [pc, #0x4c] @ =gCamera
ldr r0, [r3, #0x0]
lsl r1, r1, #0x10
asr r1, r1, #0x10
sub r1, r1, r0
mov r0, r8
strh r1, [r0, #0x10]
ldr r0, [r3, #0x4]
lsl r2, r2, #0x10
asr r2, r2, #0x10
sub r2, r2, r0
mov r3, r8
strh r2, [r3, #0x12]
add r1, #0x80
lsl r1, r1, #0x10
mov r0, #0xf8
lsl r0, r0, #0x11
cmp r1, r0
bhi .L76
mov r1, #0x12
ldrsh r0, [r3, r1]
add r0, #0x80
cmp r0, #0x0
blt .L76
lsl r1, r2, #0x10
mov r0, #0x90
lsl r0, r0, #0x11
cmp r1, r0
ble .L90
.L76:
mov r2, r10
ldrb r0, [r2, #0xa]
strb r0, [r6, #0x0]
ldr r0, [r4, #0x0]
bl TaskDestroy-0x4
b .L190
.word gCurTask
.word #0x300000c
.word gCamera
.L90:
mov r3, #0x0
mov r9, r3
ldr r0, [pc, #0x24] @ =#0x30000aa
add r0, r5, r0
str r0, [sp, #0x8]
ldr r1, [pc, #0x24] @ =#0x3000088
add r1, r5, r1
str r1, [sp, #0xc]
ldr r2, [pc, #0x20] @ =#0x30000a8
add r2, r5, r2
str r2, [sp, #0x4]
ldr r3, [pc, #0x20] @ =#0x300008c
add r3, r5, r3
str r3, [sp, #0x10]
.Lac:
mov r0, r9
cmp r0, #0x1
beq .Le0
cmp r0, #0x1
bgt .Lcc
cmp r0, #0x0
beq .Ld8
b .Lf6
.word #0x30000aa
.word #0x3000088
.word #0x30000a8
.word #0x300008c
.Lcc:
mov r1, r9
cmp r1, #0x2
beq .Le8
cmp r1, #0x3
beq .Lf0
b .Lf6
.Ld8:
mov r2, #0x34
add r2, r10
mov r8, r2
b .Lf6
.Le0:
mov r3, #0x5c
add r3, r10
mov r8, r3
b .Lf6
.Le8:
mov r0, #0x5c
add r0, r10
mov r8, r0
b .Lf6
.Lf0:
mov r1, #0x34
add r1, r10
mov r8, r1
.Lf6:
mov r2, r9
lsl r1, r2, #0x2
ldr r3, [sp, #0x8]
add r5, r3, r1
ldrh r0, [r5, #0x0]
add r0, #0x80
strh r0, [r5, #0x0]
lsl r2, r2, #0x3
ldr r0, [sp, #0xc]
add r6, r0, r2
ldr r3, [sp, #0x4]
add r7, r3, r1
mov r0, #0x0
ldrsh r1, [r7, r0]
ldr r0, [r6, #0x0]
add r0, r0, r1
str r0, [r6, #0x0]
ldr r1, [sp, #0x10]
add r4, r1, r2
mov r2, #0x0
ldrsh r1, [r5, r2]
ldr r0, [r4, #0x0]
add r0, r0, r1
str r0, [r4, #0x0]
asr r0, r0, #0x8
ldr r1, [r6, #0x0]
asr r1, r1, #0x8
ldr r2, [pc, #0x70] @ =sub_8051F54
str r2, [sp, #0x0]
mov r2, #0x1
mov r3, #0x8
bl sub_8052418-0x4
cmp r0, #0x0
bge .L15e
lsl r1, r0, #0x8
ldr r0, [r4, #0x0]
add r0, r0, r1
str r0, [r4, #0x0]
mov r3, #0x0
ldrsh r1, [r7, r3]
lsl r0, r1, #0x1
add r0, r0, r1
asr r0, r0, #0x2
strh r0, [r7, #0x0]
mov r0, #0x0
ldrsh r1, [r5, r0]
lsl r0, r1, #0x1
add r0, r0, r1
neg r0, r0
asr r0, r0, #0x2
strh r0, [r5, #0x0]
.L15e:
ldr r1, [r6, #0x0]
asr r1, r1, #0x8
ldr r2, [pc, #0x40] @ =gCamera
ldr r0, [r2, #0x0]
sub r1, r1, r0
mov r3, r8
strh r1, [r3, #0x10]
ldr r0, [r4, #0x0]
asr r0, r0, #0x8
ldr r1, [r2, #0x4]
sub r0, r0, r1
strh r0, [r3, #0x12]
mov r0, r8
bl UpdateSpriteAnimation-0x4
mov r0, r8
bl DisplaySprite-0x4
mov r0, r9
add r0, #0x1
lsl r0, r0, #0x18
lsr r0, r0, #0x18
mov r9, r0
cmp r0, #0x3
bls .Lac
.L190:
add sp, #0x14
pop {r3, r4, r5}
mov r8, r3
mov r9, r4
mov r10, r5
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.word sub_8051F54
.word gCamera
```

# Declarations for the functions called from the target assembly

- `void UpdateBgAnimationTiles(Background *);`
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

Decompile the following target assembly function from `asm/code_2.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
	thumb_func_start sub_80A52DC
sub_80A52DC: @ 0x080A52DC
	push {r4, r5, r6, r7, lr}
	mov r7, sb
	mov r6, r8
	push {r6, r7}
	sub sp, #0xc
	ldr r0, _080A537C @ =gCurTask
	ldr r0, [r0]
	ldrh r1, [r0, #6]
	movs r0, #0xc0
	lsls r0, r0, #0x12
	adds r4, r1, r0
	movs r7, #0
	movs r5, #0xff
	mov r8, r5
	mov sb, r5
	movs r2, #0
	adds r0, #9
	adds r1, r1, r0
_080A5300:
	adds r0, r1, r2
	ldrb r0, [r0]
	cmp r0, #1
	bne _080A530A
	adds r5, r2, #0
_080A530A:
	cmp r0, #4
	bne _080A5310
	mov r8, r2
_080A5310:
	cmp r0, #3
	bne _080A5316
	mov sb, r2
_080A5316:
	adds r0, r2, #1
	lsls r0, r0, #0x18
	lsrs r2, r0, #0x18
	cmp r2, #2
	bls _080A5300
	adds r0, r4, #0
	bl sub_80A5824
	adds r0, r4, #0
	adds r0, #0xd8
	bl UpdateBgAnimationTiles
	ldrh r0, [r4, #0x16]
	cmp r0, #0x59
	bhi _080A5338
	adds r0, #1
	strh r0, [r4, #0x16]
_080A5338:
	movs r1, #0xe8
	lsls r1, r1, #1
	adds r0, r4, r1
	str r0, [sp]
	adds r1, #0x28
	adds r0, r4, r1
	str r0, [sp, #4]
	adds r1, #0x28
	adds r0, r4, r1
	str r0, [sp, #8]
	ldrh r0, [r4, #0x16]
	cmp r0, #9
	bne _080A5380
	lsls r1, r5, #0x18
	cmp r1, #0
	blt _080A53DE
	lsrs r1, r1, #0x18
	adds r0, r4, #0
	adds r0, #0xc
	adds r0, r0, r1
	movs r2, #0
	strb r2, [r0]
	lsls r1, r1, #1
	adds r0, r4, #0
	adds r0, #0x10
	adds r0, r0, r1
	strh r2, [r0]
	adds r0, r4, #0
	movs r1, #5
	movs r2, #1
	movs r3, #1
	bl sub_80A4BF8
	b _080A53DE
	.align 2, 0
_080A537C: .4byte gCurTask
_080A5380:
	cmp r0, #0x3b
	bne _080A53B0
	mov r0, r8
	lsls r1, r0, #0x18
	cmp r1, #0
	blt _080A53DE
	lsrs r1, r1, #0x18
	adds r0, r4, #0
	adds r0, #0xc
	adds r0, r0, r1
	movs r2, #0
	strb r2, [r0]
	lsls r1, r1, #1
	adds r0, r4, #0
	adds r0, #0x10
	adds r0, r0, r1
	strh r2, [r0]
	adds r0, r4, #0
	movs r1, #5
	movs r2, #1
	movs r3, #4
	bl sub_80A4BF8
	b _080A53DE
_080A53B0:
	cmp r0, #0x59
	bne _080A53DE
	mov r0, sb
	lsls r1, r0, #0x18
	cmp r1, #0
	blt _080A53DE
	lsrs r1, r1, #0x18
	adds r0, r4, #0
	adds r0, #0xc
	adds r0, r0, r1
	movs r2, #0
	strb r2, [r0]
	lsls r1, r1, #1
	adds r0, r4, #0
	adds r0, #0x10
	adds r0, r0, r1
	strh r2, [r0]
	adds r0, r4, #0
	movs r1, #5
	movs r2, #1
	movs r3, #3
	bl sub_80A4BF8
_080A53DE:
	ldrh r0, [r4, #0x16]
	cmp r0, #9
	bls _080A544C
	lsls r0, r5, #0x18
	adds r5, r0, #0
	cmp r5, #0
	blt _080A53F8
	lsrs r1, r5, #0x18
	adds r0, r4, #0
	bl sub_80A555C
	cmp r0, #1
	bne _080A53FE
_080A53F8:
	adds r0, r7, #1
	lsls r0, r0, #0x18
	lsrs r7, r0, #0x18
_080A53FE:
	lsrs r2, r5, #0x18
	adds r0, r4, #0
	adds r0, #0xc
	adds r1, r0, r2
	ldrb r1, [r1]
	adds r6, r0, #0
	cmp r1, #3
	bne _080A5428
	lsls r0, r2, #1
	adds r1, r4, #0
	adds r1, #0x10
	adds r1, r1, r0
	ldrh r0, [r1]
	cmp r0, #0
	bne _080A5428
	adds r0, r4, #0
	movs r1, #6
	movs r2, #1
	movs r3, #1
	bl sub_80A4BF8
_080A5428:
	lsrs r1, r5, #0x18
	adds r0, r6, r1
	ldrb r0, [r0]
	cmp r0, #6
	bne _080A544C
	lsls r0, r1, #1
	adds r1, r4, #0
	adds r1, #0x10
	adds r1, r1, r0
	ldrh r0, [r1]
	cmp r0, #0
	bne _080A544C
	adds r0, r4, #0
	movs r1, #7
	movs r2, #1
	movs r3, #1
	bl sub_80A4BF8
_080A544C:
	ldrh r0, [r4, #0x16]
	cmp r0, #0x3b
	bls _080A54BC
	mov r1, r8
	lsls r0, r1, #0x18
	adds r5, r0, #0
	cmp r5, #0
	blt _080A5468
	lsrs r1, r5, #0x18
	adds r0, r4, #0
	bl sub_80A555C
	cmp r0, #1
	bne _080A546E
_080A5468:
	adds r0, r7, #1
	lsls r0, r0, #0x18
	lsrs r7, r0, #0x18
_080A546E:
	lsrs r2, r5, #0x18
	adds r0, r4, #0
	adds r0, #0xc
	adds r1, r0, r2
	ldrb r1, [r1]
	adds r6, r0, #0
	cmp r1, #3
	bne _080A5498
	lsls r0, r2, #1
	adds r1, r4, #0
	adds r1, #0x10
	adds r1, r1, r0
	ldrh r0, [r1]
	cmp r0, #0
	bne _080A5498
	adds r0, r4, #0
	movs r1, #6
	movs r2, #1
	movs r3, #4
	bl sub_80A4BF8
_080A5498:
	lsrs r1, r5, #0x18
	adds r0, r6, r1
	ldrb r0, [r0]
	cmp r0, #6
	bne _080A54BC
	lsls r0, r1, #1
	adds r1, r4, #0
	adds r1, #0x10
	adds r1, r1, r0
	ldrh r0, [r1]
	cmp r0, #0
	bne _080A54BC
	adds r0, r4, #0
	movs r1, #7
	movs r2, #1
	movs r3, #4
	bl sub_80A4BF8
_080A54BC:
	ldrh r0, [r4, #0x16]
	cmp r0, #0x59
	bls _080A552C
	mov r1, sb
	lsls r0, r1, #0x18
	adds r5, r0, #0
	cmp r5, #0
	blt _080A54D8
	lsrs r1, r5, #0x18
	adds r0, r4, #0
	bl sub_80A555C
	cmp r0, #1
	bne _080A54DE
_080A54D8:
	adds r0, r7, #1
	lsls r0, r0, #0x18
	lsrs r7, r0, #0x18
_080A54DE:
	lsrs r2, r5, #0x18
	adds r0, r4, #0
	adds r0, #0xc
	adds r1, r0, r2
	ldrb r1, [r1]
	adds r6, r0, #0
	cmp r1, #3
	bne _080A5508
	lsls r0, r2, #1
	adds r1, r4, #0
	adds r1, #0x10
	adds r1, r1, r0
	ldrh r0, [r1]
	cmp r0, #0
	bne _080A5508
	adds r0, r4, #0
	movs r1, #6
	movs r2, #1
	movs r3, #3
	bl sub_80A4BF8
_080A5508:
	lsrs r1, r5, #0x18
	adds r0, r6, r1
	ldrb r0, [r0]
	cmp r0, #6
	bne _080A552C
	lsls r0, r1, #1
	adds r1, r4, #0
	adds r1, #0x10
	adds r1, r1, r0
	ldrh r0, [r1]
	cmp r0, #0
	bne _080A552C
	adds r0, r4, #0
	movs r1, #7
	movs r2, #1
	movs r3, #3
	bl sub_80A4BF8
_080A552C:
	cmp r7, #3
	bne _080A5536
	ldr r1, [r4]
	movs r0, #0x16
	strb r0, [r1]
_080A5536:
	ldr r0, _080A5554 @ =gBldRegs
	ldrh r0, [r0, #4]
	cmp r0, #0x10
	bne _080A5546
	ldr r0, _080A5558 @ =gCurTask
	ldr r0, [r0]
	bl TaskDestroy
_080A5546:
	add sp, #0xc
	pop {r3, r4}
	mov r8, r3
	mov sb, r4
	pop {r4, r5, r6, r7}
	pop {r0}
	bx r0
	.align 2, 0
_080A5554: .4byte gBldRegs
_080A5558: .4byte gCurTask

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
