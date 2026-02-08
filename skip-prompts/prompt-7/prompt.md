You are decompiling an assembly function called `sub_8058094` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `sub_803D784`

```c
void sub_803D784(bool32 param0)
{
    BonusGameUI *ui = TASK_DATA(gCurTask);
    Sprite *s;

    if (ui->unk17 != 0) {
        --ui->unk17;

        if (!param0 && ui->unk17 <= 30) {
            if (!(ui->unk17 & 2)) {
                return;
            }
        }

        s = &ui->sprCountdownDigit;
        UpdateSpriteAnimation(s);
        DisplaySprite(s);
    }
}
```

```asm
push {r4, lr}
mov r3, r0
ldr r0, [pc, #0x40] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r1, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r1, r1, r0
ldrb r0, [r1, #0x17]
cmp r0, #0x0
beq .L40
subs r2, r0, #0x1
strb r2, [r1, #0x17]
cmp r3, #0x0
bne .L2e
lsl r0, r2, #0x18
lsr r0, r0, #0x18
cmp r0, #0x1e
bhi .L2e
mov r0, #0x2
and r2, r0
cmp r2, #0x0
beq .L40
.L2e:
mov r0, #0xd8
lsl r0, r0, #0x2
add r4, r1, r0
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r0, r4
bl DisplaySprite-0x4
.L40:
pop {r4}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
```

## `sub_80469E0`

```c
void sub_80469E0(void)
{
    GoalRingImpl *ring = TASK_DATA(gCurTask);
    Sprite *s = &ring->sprites[0];
    s16 screenX, screenY;
    s16 i;

    screenY = s->y;
    screenX = s->x;

    if (!IS_OUT_OF_CAM_RANGE(screenX, screenY)) {
        for (i = 0; i < (s32)ARRAY_COUNT(ring->sprites); i++, s++) {
            UpdateSpriteAnimation(s);
            DisplaySprite(s);
        }
    }
}
```

```asm
push {r4, r5, lr}
ldr r0, [pc, #0x54] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r0, [r0, #0x6]
ldr r1, [pc, #0x50] @ =#0x300000c
add r4, r0, r1
ldrh r2, [r4, #0x12]
mov r1, #0x10
ldrsh r0, [r4, r1]
add r0, #0x80
lsl r0, r0, #0x10
mov r1, #0xf8
lsl r1, r1, #0x11
cmp r0, r1
bhi .L52
lsl r0, r2, #0x10
asr r1, r0, #0x10
mov r0, r1
add r0, #0x80
cmp r0, #0x0
blt .L52
mov r0, #0x90
lsl r0, r0, #0x1
cmp r1, r0
bgt .L52
mov r5, #0x0
.L34:
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r0, r4
bl DisplaySprite-0x4
lsl r0, r5, #0x10
mov r1, #0x80
lsl r1, r1, #0x9
add r0, r0, r1
add r4, #0x28
lsr r5, r0, #0x10
asr r0, r0, #0x10
cmp r0, #0x1
ble .L34
.L52:
pop {r4, r5}
pop {r0}
bx r0
.word gCurTask
.word #0x300000c
```

## `sub_803BF78`

```c
void sub_803BF78(u32 param0)
{
    Capsule *cap = TASK_DATA(gCurTask);
    Sprite *s;

    if (cap->unkD != 0) {
        --cap->unkD;

        if ((param0 == 0) && (cap->unkD < 31)) {
            if (!(cap->unkD & 0x2)) {
                return;
            }
        }

        s = &cap->s3;
        UpdateSpriteAnimation(s);
        DisplaySprite(s);
    }
}
```

```asm
push {r4, lr}
mov r3, r0
ldr r0, [pc, #0x40] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r1, [r0, #0x6]
mov r0, #0xc0
lsl r0, r0, #0x12
add r1, r1, r0
ldrb r0, [r1, #0xd]
cmp r0, #0x0
beq .L40
subs r2, r0, #0x1
strb r2, [r1, #0xd]
cmp r3, #0x0
bne .L2e
lsl r0, r2, #0x18
lsr r0, r0, #0x18
cmp r0, #0x1e
bhi .L2e
mov r0, #0x2
and r2, r0
cmp r2, #0x0
beq .L40
.L2e:
mov r0, #0xb1
lsl r0, r0, #0x3
add r4, r1, r0
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r0, r4
bl DisplaySprite-0x4
.L40:
pop {r4}
pop {r0}
bx r0
.hword #0x0
.word gCurTask
```

## `sub_8034250`

```c
void sub_8034250(void)
{
    GoalRing *ring = TASK_DATA(gCurTask);
    Sprite *s = &ring->s[0];
    s16 x = s->x;
    s16 y = s->y;

    if (!IS_OUT_OF_CAM_RANGE(x, y)) {
        UpdateSpriteAnimation(s);
        DisplaySprite(s);

        s = &ring->s[1];
        UpdateSpriteAnimation(s);
        sub_80C07E0(s);
    }
}
```

```asm
push {r4, r5, lr}
ldr r0, [pc, #0x50] @ =gCurTask
ldr r0, [r0, #0x0]
ldrh r5, [r0, #0x6]
ldr r0, [pc, #0x4c] @ =#0x300000c
add r4, r5, r0
ldrh r2, [r4, #0x12]
mov r1, #0x10
ldrsh r0, [r4, r1]
add r0, #0x80
lsl r0, r0, #0x10
mov r1, #0xf8
lsl r1, r1, #0x11
cmp r0, r1
bhi .L4e
lsl r0, r2, #0x10
asr r1, r0, #0x10
mov r0, r1
add r0, #0x80
cmp r0, #0x0
blt .L4e
mov r0, #0x90
lsl r0, r0, #0x1
cmp r1, r0
bgt .L4e
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r0, r4
bl DisplaySprite-0x4
ldr r0, [pc, #0x1c] @ =#0x3000034
add r4, r5, r0
mov r0, r4
bl UpdateSpriteAnimation-0x4
mov r0, r4
bl sub_80C07E0-0x4
.L4e:
pop {r4, r5}
pop {r0}
bx r0
.word gCurTask
.word #0x300000c
.word #0x3000034
```

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
	thumb_func_start sub_8058094
sub_8058094: @ 0x08058094
	push {r4, r5, lr}
	ldr r0, _080580E4 @ =gCurTask
	ldr r2, [r0]
	ldrh r1, [r2, #6]
	movs r0, #0xc0
	lsls r0, r0, #0x12
	adds r4, r1, r0
	adds r0, #0x20
	adds r5, r1, r0
	ldrh r0, [r4, #0xa]
	adds r0, #1
	strh r0, [r4, #0xa]
	lsls r0, r0, #0x10
	lsrs r0, r0, #0x10
	cmp r0, #0x40
	bne _080580BC
	movs r0, #0
	strh r0, [r4, #0xa]
	ldr r0, _080580E8 @ =sub_805732C
	str r0, [r2, #8]
_080580BC:
	bl sub_8057848
	movs r0, #1
	movs r1, #1
	bl sub_80578EC
	movs r0, #0x78
	strh r0, [r5, #0x10]
	ldrb r0, [r4, #5]
	strh r0, [r5, #0x12]
	adds r0, r5, #0
	bl UpdateSpriteAnimation
	adds r0, r5, #0
	bl DisplaySprite
	pop {r4, r5}
	pop {r0}
	bx r0
	.align 2, 0
_080580E4: .4byte gCurTask
_080580E8: .4byte sub_805732C

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
