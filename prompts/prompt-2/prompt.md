You are decompiling an assembly function called `sub_8056430` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `sub_803BDA0`

```c
void sub_803BDA0(void)
{
    Capsule *cap = TASK_DATA(gCurTask);
    Sprite *s;

    s = &cap->spr628[0];
    DisplaySprite(s);
    s = &cap->spr628[1];
    DisplaySprite(s);
    s = &cap->spr628[2];
    DisplaySprite(s);
    s = &cap->spr628[3];
    DisplaySprite(s);
    s = &cap->spr628[4];

    if ((cap->unk14 != 0) && (cap->unk15-- == 0)) {
        cap->unk15 = 20;
        sub_8003DF0(SE_BONUS_1UP_COUNTER);
        cap->unk14--;

        s->variant++;
    }
    UpdateSpriteAnimation(s);
    DisplaySprite(s);
}
```

```asm
push {r4, r5, r6, lr}
ldr r0, [pc, #0x74] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r4, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r6, r4, r0
ldr r0, [pc, #0x6c] @ =#0x3000628
add r5, r4, r0
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x64] @ =#0x3000650
add r5, r4, r0
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x60] @ =#0x3000678
add r5, r4, r0
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x58] @ =#0x30006a0
add r5, r4, r0
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x54] @ =#0x30006c8
add r5, r4, r0
ldrb r0, [r6, #0x14]
cmp r0, #0x0
beq .L64
ldrb r0, [r6, #0x15]
sub r0, #0x1
strb r0, [r6, #0x15]
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0xff
bne .L64
mov r0, #0x14
strb r0, [r6, #0x15]
ldr r0, [pc, #0x3c] @ =#0x20d
bl sub_8003DF0-0x4
ldrb r0, [r6, #0x14]
sub r0, #0x1
strb r0, [r6, #0x14]
ldrb r0, [r5, #0x1a]
add r0, #0x1
strb r0, [r5, #0x1a]
.L64:
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r0, r5
bl DisplaySprite-0x4
pop {r4, r5, r6}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
.word #0x3000628
.word #0x3000650
.word #0x3000678
.word #0x30006a0
.word #0x30006c8
.word #0x20d
```

## `sub_803BC0C`

```c
void sub_803BC0C(void)
{
    Capsule *cap = TASK_DATA(gCurTask);
    u8 i;

    for (i = 0; i < (s32)ARRAY_COUNT(cap->switches); i++) {
        CapSwitch *swit = &cap->switches[i];

        if ((swit->unk6 != 0) && ((swit->unk5 != 0) || ((swit->unk6 & 0x2) != 2))) {
            Sprite *s = &swit->s;

            s->x = I(swit->unkC) - gCamera.x;
            s->y = I(swit->unk10) - gCamera.y;

            UpdateSpriteAnimation(s);
            DisplaySprite(s);
        }
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
ldr r0, [pc, #0x64] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r1, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r7, r1, r0
mov r5, #0x0
ldr r6, [pc, #0x58] @ =gCamera
.L12:
lsl r0, r5, #0x4
sub r0, r0, r5
lsl r0, r0, #0x2
add r0, #0xec
add r2, r7, r0
mov r0, #0x6
ldrsb r0, [r2, r0]
cmp r0, #0x0
beq .L56
ldr r0, [r2, #0x4]
ldr r1, [pc, #0x48] @ =#0x2ff00
and r0, r1
mov r1, #0x80
lsl r1, r1, #0xa
cmp r0, r1
beq .L56
mov r4, r2
add r4, #0x14
ldr r0, [r2, #0xc]
asr r0, r0, #0x8
ldr r1, [r6, #0x0]
sub r0, r0, r1
strh r0, [r4, #0x10]
ldr r0, [r2, #0x10]
asr r0, r0, #0x8
ldr r1, [r6, #0x4]
sub r0, r0, r1
strh r0, [r4, #0x12]
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r0, r4
bl DisplaySprite-0x4
.L56:
add r0, r5, #0x1
lsl r0, r0, #0x18
lsr r5, r0, #0x18
cmp r5, #0x4
bls .L12
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
.word gCamera
.word #0x2ff00
```

## `sub_803D614`

```c
END_NONMATCH

void sub_803D614(void)
{
    BonusGameUI *ui = TASK_DATA(gCurTask);
    Sprite *s;

    s = &ui->sprPlayer1Icon;
    UpdateSpriteAnimation(s);
    DisplaySprite(s);

    s = &ui->sprPlayer2Icon;
    UpdateSpriteAnimation(s);
    DisplaySprite(s);

    s = &ui->spr518;
    UpdateSpriteAnimation(s);
    DisplaySprite(s);

    s = &ui->spr540;
    UpdateSpriteAnimation(s);
    DisplaySprite(s);

    s = &ui->spr568;

    // TODO: Maybe a bug? (ui->unk15-- == 0)
    if ((ui->unk14 != 0) && (ui->unk15-- == 0)) {
        ui->unk15 = 20;

        sub_8003DF0(SE_BONUS_1UP_COUNTER);
        ui->unk14--;
        s->variant++;
    }

    UpdateSpriteAnimation(s);
    DisplaySprite(s);
}
```

```asm
push {r4, r5, r6, lr}
ldr r0, [pc, #0x8c] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r4, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r6, r4, r0
ldr r0, [pc, #0x84] @ =#0x30004c8
add r5, r4, r0
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x78] @ =#0x30004f0
add r5, r4, r0
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x6c] @ =#0x3000518
add r5, r4, r0
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x60] @ =#0x3000540
add r5, r4, r0
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r0, r5
bl DisplaySprite-0x4
ldr r0, [pc, #0x54] @ =#0x3000568
add r5, r4, r0
ldrb r0, [r6, #0x14]
cmp r0, #0x0
beq .L7c
ldrb r0, [r6, #0x15]
sub r0, #0x1
strb r0, [r6, #0x15]
lsl r0, r0, #0x18
lsr r0, r0, #0x18
cmp r0, #0xff
bne .L7c
mov r0, #0x14
strb r0, [r6, #0x15]
ldr r0, [pc, #0x3c] @ =#0x20d
bl sub_8003DF0-0x4
ldrb r0, [r6, #0x14]
sub r0, #0x1
strb r0, [r6, #0x14]
ldrb r0, [r5, #0x1a]
add r0, #0x1
strb r0, [r5, #0x1a]
.L7c:
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r0, r5
bl DisplaySprite-0x4
pop {r4, r5, r6}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
.word #0x30004c8
.word #0x30004f0
.word #0x3000518
.word #0x3000540
.word #0x3000568
.word #0x20d
```

## `sub_8040814`

```c
void sub_8040814(void)
{
    IA_095 *ia = TASK_DATA(gCurTask);
    Sprite *s = &ia->s;
    u8 i;

    UpdateSpriteAnimation(s);

    for (i = 0; i < NUM_SINGLE_PLAYER_CHARS; i++) {
        Player *p = ia->chars[i];

        if (GetBit(ia->unk24, i)) {
            s->x = I(p->qWorldX) - gCamera.x;
            s->y = I(p->qWorldY) - gCamera.y;
            DisplaySprite(s);
        }
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
ldr r0, [pc, #0x5c] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r1, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r6, r1, r0
add r0, #0x30
add r4, r1, r0
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r5, #0x0
ldr r7, [pc, #0x48] @ =gCamera
.L1c:
lsl r1, r5, #0x2
mov r0, r6
add r0, #0x28
add r0, r0, r1
ldr r2, [r0, #0x0]
mov r0, r6
add r0, #0x24
ldrb r0, [r0, #0x0]
asr r0, r5
mov r1, #0x1
and r0, r1
cmp r0, #0x0
beq .L50
ldr r0, [r2, #0x10]
asr r0, r0, #0x8
ldr r1, [r7, #0x0]
sub r0, r0, r1
strh r0, [r4, #0x10]
ldr r0, [r2, #0x14]
asr r0, r0, #0x8
ldr r1, [r7, #0x4]
sub r0, r0, r1
strh r0, [r4, #0x12]
mov r0, r4
bl DisplaySprite-0x4
.L50:
add r0, r5, #0x1
lsl r0, r0, #0x18
lsr r5, r0, #0x18
cmp r5, #0x1
bls .L1c
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.word gCurTask
.word gCamera
```

## `Task_UpdateStarParticles`

```c
END_NONMATCH

void Task_UpdateStarParticles(void)
{
    Rocket *rocket = TASK_DATA(gCurTask);
    MapEntity *me = rocket->base.me;
    u8 arr[0x10];
    u8 i;
    Vec2_32 *qPoint;
    memcpy(arr, gUnknown_080D03B0, sizeof(arr));

    if (--rocket->unkC == 0) {
        SET_MAP_ENTITY_NOT_INITIALIZED(me, rocket->base.meX);
        TaskDestroy(gCurTask);
        return;
    } else {
        sub_8046358(rocket);

        if ((rocket->unkC < ZONE_TIME_TO_INT(0, 0.5)) && (rocket->unkC & 0x2)) {
            return;
        }

        UpdateSpriteAnimation(&rocket->sprites[1]);
        UpdateSpriteAnimation(&rocket->sprites[2]);
        UpdateSpriteAnimation(&rocket->sprites[3]);

        for (i = 0, qPoint = &rocket->qStarWorldPos[0]; i < (s32)ARRAY_COUNT(arr); i++) {
            Sprite *s = &rocket->sprites[arr[i]];
            s->x = I(qPoint->x) - gCamera.x;
            s->y = I(qPoint->y) - gCamera.y;
            qPoint++;
            DisplaySprite(s);
        }
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
sub sp, sp, #0x10
ldr r7, [pc, #0x2c] @ =gCurTask
ldr r0, [r7, #0x0]
ldrh r4, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r6, r4, r0
ldr r5, [r6, #0x0]
ldr r1, [pc, #0x24] @ =gUnknown_080D03B0
mov r0, sp
mov r2, #0x10
bl memcpy-0x4
ldrh r0, [r6, #0xc]
sub r0, #0x1
strh r0, [r6, #0xc]
lsl r0, r0, #0x10
cmp r0, #0x0
bne .L3c
ldrb r0, [r6, #0x8]
strb r0, [r5, #0x0]
ldr r0, [r7, #0x0]
bl TaskDestroy-0x4
b .La4
.word gCurTask
.word gUnknown_080D03B0
.L3c:
mov r0, r6
bl .Lbc
ldrh r1, [r6, #0xc]
cmp r1, #0x1d
bhi .L50
mov r0, #0x2
and r0, r1
cmp r0, #0x0
bne .La4
.L50:
ldr r1, [pc, #0x58] @ =#0x3000110
add r0, r4, r1
bl UpdateSpriteAnimation-0x4
ldr r1, [pc, #0x54] @ =#0x3000138
add r0, r4, r1
bl UpdateSpriteAnimation-0x4
ldr r1, [pc, #0x50] @ =#0x3000160
add r0, r4, r1
bl UpdateSpriteAnimation-0x4
mov r5, #0x0
ldr r0, [pc, #0x4c] @ =#0x3000060
add r4, r4, r0
ldr r7, [pc, #0x4c] @ =gCamera
.L70:
mov r1, sp
add r0, r1, r5
ldrb r1, [r0, #0x0]
lsl r0, r1, #0x2
add r0, r0, r1
lsl r0, r0, #0x3
add r0, #0xe8
add r0, r6, r0
ldr r1, [r4, #0x0]
asr r1, r1, #0x8
ldr r2, [r7, #0x0]
sub r1, r1, r2
strh r1, [r0, #0x10]
ldr r1, [r4, #0x4]
asr r1, r1, #0x8
ldr r2, [r7, #0x4]
sub r1, r1, r2
strh r1, [r0, #0x12]
add r4, #0x8
bl DisplaySprite-0x4
add r0, r5, #0x1
lsl r0, r0, #0x18
lsr r5, r0, #0x18
cmp r5, #0xf
bls .L70
.La4:
add sp, #0x10
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.word #0x3000110
.word #0x3000138
.word #0x3000160
.word #0x3000060
.Lbc:
.word gCamera
```

# Declarations for the functions called from the target assembly

- `AnimCmdResult UpdateSpriteAnimation(Sprite *);`

# Types definitions used in the declarations

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
typedef enum {
    ACMD_RESULT__ANIM_CHANGED = -1,
    ACMD_RESULT__ENDED = 0,
    ACMD_RESULT__RUNNING = +1,
} AnimCmdResult;
```

```c
typedef AnimCmdResult (*AnimationCommandFunc)(void *cursor, Sprite *sprite);
```

# Primary Objective

Decompile the following target assembly function from `asm/code_1.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
	thumb_func_start sub_8056430
sub_8056430: @ 0x08056430
	push {r4, r5, r6, lr}
	sub sp, #8
	ldr r0, _0805648C @ =gCurTask
	ldr r0, [r0]
	ldrh r1, [r0, #6]
	movs r0, #0xc0
	lsls r0, r0, #0x12
	adds r6, r1, r0
	ldr r1, _08056490 @ =gUnknown_080D1D50
	mov r0, sp
	movs r2, #7
	bl memcpy
	movs r0, #0
_0805644C:
	lsls r5, r0, #0x10
	asrs r5, r5, #0x10
	lsls r4, r5, #2
	adds r4, r4, r5
	lsls r4, r4, #3
	movs r0, #0x86
	lsls r0, r0, #1
	adds r4, r4, r0
	adds r4, r6, r4
	ldrb r1, [r6, #0x18]
	mov r2, sp
	adds r0, r2, r5
	ldrb r0, [r0]
	adds r1, r1, r0
	strh r1, [r4, #0x10]
	adds r0, r4, #0
	bl UpdateSpriteAnimation
	adds r0, r4, #0
	bl DisplaySprite
	adds r5, #1
	lsls r5, r5, #0x10
	lsrs r0, r5, #0x10
	asrs r5, r5, #0x10
	cmp r5, #6
	ble _0805644C
	add sp, #8
	pop {r4, r5, r6}
	pop {r0}
	bx r0
	.align 2, 0
_0805648C: .4byte gCurTask
_08056490: .4byte gUnknown_080D1D50

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
