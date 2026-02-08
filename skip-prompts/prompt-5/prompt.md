You are decompiling an assembly function called `sub_8090930` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `sub_8064564`

```c
s32 sub_8064564(ClamProj *proj)
{
    Sprite2 *s;
    s32 dx, dy;
    AnimCmdResult acmdRes;

    s = &proj->s;
    dx = TO_WORLD_POS_RAW(I(proj->qPos.x), proj->region[0]) - gCamera.x;
    s->x = dx;
    dy = TO_WORLD_POS_RAW(I(proj->qPos.y), proj->region[1]) - gCamera.y;
    s->y = dy;
    s->x = dx + I(proj->unk14);

    if (proj->unk0 != 0) {
        dy += 20;
        dy += I(proj->unk18);
        s->y = dy;
    } else {
        dy -= 20;
        dy += I(proj->unk18);
        s->y = dy;
    }

    if (proj->unk1 != 0) {
        s->x += 10;
    } else {
        s->x -= 10;
    }

    acmdRes = UpdateSpriteAnimation((Sprite *)s);
    DisplaySprite((Sprite *)s);
    return acmdRes;
}
```

```asm
push {r4, r5, lr}
mov r4, r0
mov r5, r4
add r5, #0x1c
ldr r2, [r4, #0xc]
asr r2, r2, #0x8
ldrh r0, [r4, #0x2]
lsl r0, r0, #0x8
add r2, r2, r0
ldr r3, [pc, #0x28] @ =gCamera
ldr r0, [r3, #0x0]
sub r2, r2, r0
strh r2, [r5, #0x10]
ldr r1, [r4, #0x10]
asr r1, r1, #0x8
ldrh r0, [r4, #0x4]
lsl r0, r0, #0x8
add r1, r1, r0
ldr r0, [r3, #0x4]
sub r1, r1, r0
strh r1, [r5, #0x12]
ldr r0, [r4, #0x14]
asr r0, r0, #0x8
add r2, r2, r0
strh r2, [r5, #0x10]
ldrb r0, [r4, #0x0]
cmp r0, #0x0
beq .L40
add r1, #0x14
b .L42
.word gCamera
.L40:
sub r1, #0x14
.L42:
ldr r0, [r4, #0x18]
asr r0, r0, #0x8
add r1, r1, r0
strh r1, [r5, #0x12]
ldrb r0, [r4, #0x1]
cmp r0, #0x0
beq .L56
ldrh r0, [r5, #0x10]
add r0, #0xa
b .L5a
.L56:
ldrh r0, [r5, #0x10]
sub r0, #0xa
.L5a:
strh r0, [r5, #0x10]
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r4, r0
mov r0, r5
bl DisplaySprite-0x4
mov r0, r4
pop {r4, r5}
pop {r1}
bx r1
```

## `sub_8063E5C`

```c
AnimCmdResult sub_8063E5C(Marun *enemy)
{
    AnimCmdResult result;
    Sprite *s = &enemy->s;
    SpriteTransform *transform = &enemy->transform;
    s32 screenX, screenY;

    screenX = I(enemy->qPos.x) + (enemy->region[0] * CAM_REGION_WIDTH);
    s->x = screenX - gCamera.x;

    screenY = I(enemy->qPos.y) + (enemy->region[1] * CAM_REGION_WIDTH);
    s->y = screenY - gCamera.y;

    if (s->anim == gUnknown_080D210C[2].anim && s->variant == gUnknown_080D210C[2].variant) {
        s->y -= 0xB;
    } else {
        s->y += 6;
    }

    transform->rotation = enemy->rotation;
    transform->x = s->x;
    transform->y = s->y;

    TransformSprite(s, transform);
    result = UpdateSpriteAnimation(s);
    DisplaySprite(s);

    return result;
}
```

```asm
push {r4, r5, r6, lr}
mov r3, r0
mov r5, r3
add r5, #0x38
mov r4, r3
add r4, #0x2c
ldr r1, [r3, #0x24]
asr r1, r1, #0x8
ldrh r0, [r3, #0xc]
lsl r0, r0, #0x8
add r1, r1, r0
ldr r2, [pc, #0x30] @ =gCamera
ldr r0, [r2, #0x0]
sub r1, r1, r0
strh r1, [r5, #0x10]
ldr r1, [r3, #0x28]
asr r1, r1, #0x8
ldrh r0, [r3, #0xe]
lsl r0, r0, #0x8
add r1, r1, r0
ldr r0, [r2, #0x4]
sub r1, r1, r0
strh r1, [r5, #0x12]
ldr r2, [pc, #0x1c] @ =gUnknown_080D210C
ldrh r0, [r5, #0xc]
ldrh r6, [r2, #0x10]
cmp r0, r6
bne .L50
ldrb r0, [r5, #0x1a]
ldrb r2, [r2, #0x12]
cmp r0, r2
bne .L50
mov r0, r1
sub r0, #0xb
b .L54
.hword #0x0
.word gCamera
.word gUnknown_080D210C
.L50:
ldrh r0, [r5, #0x12]
add r0, #0x6
.L54:
strh r0, [r5, #0x12]
ldrh r0, [r3, #0x10]
strh r0, [r4, #0x0]
ldrh r0, [r5, #0x10]
strh r0, [r4, #0x6]
ldrh r0, [r5, #0x12]
strh r0, [r4, #0x8]
mov r0, r5
mov r1, r4
bl TransformSprite-0x4
mov r0, r5
bl UpdateSpriteAnimation-0x4
mov r4, r0
mov r0, r5
bl DisplaySprite-0x4
mov r0, r4
pop {r4, r5, r6}
pop {r1}
bx r1
```

## `sub_804464C`

```c
void sub_804464C(IceSpike *spike)
{
    s32 *ptr32 = &spike->unk54[0];
    Sprite *s;
    u8 arr[28];
    u32 r8;
    u8 i;

    memcpy(arr, gUnknown_080D030C, sizeof(arr));

    r8 = 0;

    if (spike->base.unk18 == 14) {
        r8 = 1;
    }

    for (i = 0; i < (s32)ARRAY_COUNT(spike->s2); i++) {
        s = &spike->s2[i];
        UpdateSpriteAnimation(s);
    }

    for (i = 0; i < spike->base.unk18; i++) {
        Sprite *s = &spike->s2[arr[i] + r8];

        s->x = I(*ptr32++) - gCamera.x;
        s->y = I(*ptr32++) - gCamera.y;
        DisplaySprite(s);
    }
}
```

```asm
push {r4, r5, r6, r7, lr}
mov r7, r8
push {r7}
sub sp, sp, #0x1c
mov r5, r0
mov r7, r5
add r7, #0x54
ldr r1, [pc, #0x7c] @ =gUnknown_080D030C
mov r0, sp
mov r2, #0x1c
bl memcpy-0x4
mov r0, #0x0
mov r8, r0
ldrb r0, [r5, #0x18]
cmp r0, #0xe
bne .L26
mov r1, #0x1
mov r8, r1
.L26:
mov r4, #0x0
.L28:
lsl r0, r4, #0x2
add r0, r0, r4
lsl r0, r0, #0x3
add r0, #0xfc
add r0, r5, r0
bl UpdateSpriteAnimation-0x4
add r0, r4, #0x1
lsl r0, r0, #0x18
lsr r4, r0, #0x18
cmp r4, #0x2
bls .L28
mov r4, #0x0
ldrb r0, [r5, #0x18]
cmp r4, r0
bhs .L80
ldr r6, [pc, #0x44] @ =gCamera
.L4a:
mov r1, sp
add r0, r1, r4
ldrb r1, [r0, #0x0]
add r1, r8
lsl r0, r1, #0x2
add r0, r0, r1
lsl r0, r0, #0x3
add r0, #0xfc
add r0, r5, r0
ldmia r7!, {r1}
asr r1, r1, #0x8
ldr r2, [r6, #0x0]
sub r1, r1, r2
strh r1, [r0, #0x10]
ldmia r7!, {r1}
asr r1, r1, #0x8
ldr r2, [r6, #0x4]
sub r1, r1, r2
strh r1, [r0, #0x12]
bl DisplaySprite-0x4
add r0, r4, #0x1
lsl r0, r0, #0x18
lsr r4, r0, #0x18
ldrb r0, [r5, #0x18]
cmp r4, r0
blo .L4a
.L80:
add sp, #0x1c
pop {r3}
mov r8, r3
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.word gUnknown_080D030C
.word gCamera
```

## `sub_805E7A4`

```c
void sub_805E7A4(JugglingPin *proj)
{
    u8 *vram = proj->vram;
    Sprite2 *s;

    s = &proj->s;
    s->tiles = vram;
    s->anim = gUnknown_080D1F7C[0].anim;
    s->variant = gUnknown_080D1F7C[0].variant;
    s->prevVariant = -1;
    s->x = I(proj->qPos.x) - gCamera.x;
    s->y = I(proj->qPos.y) - gCamera.y;
    s->oamFlags = SPRITE_OAM_ORDER(19);
    s->animCursor = 0;
    s->qAnimDelay = 0;
    s->animSpeed = SPRITE_ANIM_SPEED(2.0);
    s->palId = 0;
    s->frameFlags = 0x1000;

    if (proj->unk8 != 0) {
        s->frameFlags |= 0x400;
        s->frameFlags |= 0x1000;
    }
    s->hitboxes[0].index = HITBOX_STATE_INACTIVE;
    UpdateSpriteAnimation((Sprite *)s);
}
```

```asm
push {r4, r5, r6, lr}
ldr r1, [r0, #0x14]
mov r6, r0
add r6, #0x28
str r1, [r0, #0x28]
ldr r2, [pc, #0x5c] @ =gUnknown_080D1F7C
ldrh r1, [r2, #0x0]
mov r5, #0x0
mov r4, #0x0
strh r1, [r6, #0xc]
ldrb r1, [r2, #0x2]
strb r1, [r6, #0x1a]
mov r1, #0xff
strb r1, [r6, #0x1b]
ldr r1, [r0, #0x20]
asr r1, r1, #0x8
ldr r3, [pc, #0x48] @ =gCamera
ldr r2, [r3, #0x0]
sub r1, r1, r2
strh r1, [r6, #0x10]
ldr r1, [r0, #0x24]
asr r1, r1, #0x8
ldr r2, [r3, #0x4]
sub r1, r1, r2
strh r1, [r6, #0x12]
mov r1, #0x98
lsl r1, r1, #0x3
strh r1, [r6, #0x14]
strh r4, [r6, #0xe]
strh r4, [r6, #0x16]
mov r1, #0x20
strb r1, [r6, #0x1c]
strb r5, [r6, #0x1f]
mov r1, #0x80
lsl r1, r1, #0x5
str r1, [r6, #0x8]
ldrb r0, [r0, #0x8]
cmp r0, #0x0
beq .L56
mov r0, #0x80
lsl r0, r0, #0x3
orr r0, r1
str r0, [r6, #0x8]
.L56:
mov r0, #0x1
neg r0, r0
str r0, [r6, #0x20]
mov r0, r6
bl UpdateSpriteAnimation-0x4
pop {r4, r5, r6}
pop {r0}
bx r0
.word gUnknown_080D1F7C
.word gCamera
```

## `InitDebrisSprites`

```c
void InitDebrisSprites(Boulder *boulder)
{
    Sprite *s;
    s16 i, j;

    // const s8 arr[4][4] = {{-10, -8, -6, -6}, {10, -2, 6, -4}, {-10, 0, 3, -8}, {-2, 0, -2, -3}};
    s8 arr[4][4];
    memcpy(arr, gUnknown_080D03C8, sizeof(arr));

    s = &boulder->s;
    s->tiles = boulder->tiles;
    s->anim = ANIM_BOULDER;
    s->variant = 1;
    s->oamFlags = SPRITE_OAM_ORDER(8);
    s->animCursor = 0;
    s->qAnimDelay = 0;
    s->prevVariant = -1;
    s->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s->palId = 0;
    s->hitboxes[0].index = -1;
    s->frameFlags = SPRITE_FLAG(PRIORITY, 0);
    UpdateSpriteAnimation(s);

    s = &boulder->s2;
    s->tiles = boulder->tiles + MAX_TILES_VARIANT(ANIM_BOULDER, 1) * TILE_SIZE_4BPP;
    s->anim = ANIM_BOULDER;
    s->variant = 2;
    s->oamFlags = SPRITE_OAM_ORDER(8);
    s->animCursor = 0;
    s->qAnimDelay = 0;
    s->prevVariant = -1;
    s->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s->palId = 0;
    s->hitboxes[0].index = -1;
    s->frameFlags = SPRITE_FLAG(PRIORITY, 0);
    UpdateSpriteAnimation(s);

    boulder->unk7C = 0;

    for (i = 0; i < 4; i++) {
        for (j = 0; j < 4; j++) {
            boulder->unk7D[i][j] = arr[i][j];
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
sub sp, sp, #0x10
mov r7, r0
ldr r1, [pc, #0xc4] @ =gUnknown_080D03C8
mov r0, sp
mov r2, #0x10
bl memcpy-0x4
mov r1, r7
add r1, #0xc
ldr r0, [r7, #0x74]
str r0, [r7, #0xc]
mov r5, #0x0
mov r4, #0x0
ldr r0, [pc, #0xb0] @ =#0x3a1
mov r10, r0
mov r0, r10
strh r0, [r1, #0xc]
mov r0, #0x1
strb r0, [r1, #0x1a]
mov r0, #0x80
lsl r0, r0, #0x2
mov r9, r0
mov r0, r9
strh r0, [r1, #0x14]
strh r4, [r1, #0xe]
strh r4, [r1, #0x16]
mov r0, #0xff
strb r0, [r1, #0x1b]
mov r0, #0x10
mov r8, r0
mov r0, r8
strb r0, [r1, #0x1c]
strb r5, [r1, #0x1f]
mov r6, #0x1
neg r6, r6
str r6, [r1, #0x20]
str r4, [r1, #0x8]
mov r0, r1
bl UpdateSpriteAnimation-0x4
mov r1, r7
add r1, #0x34
ldr r0, [r7, #0x74]
add r0, #0x80
str r0, [r7, #0x34]
mov r0, r10
strh r0, [r1, #0xc]
mov r0, #0x2
strb r0, [r1, #0x1a]
mov r0, r9
strh r0, [r1, #0x14]
strh r4, [r1, #0xe]
strh r4, [r1, #0x16]
mov r0, r6
strb r0, [r1, #0x1b]
mov r0, r8
strb r0, [r1, #0x1c]
strb r5, [r1, #0x1f]
str r6, [r1, #0x20]
str r4, [r1, #0x8]
mov r0, r1
bl UpdateSpriteAnimation-0x4
mov r0, r7
add r0, #0x7c
strb r5, [r0, #0x0]
mov r2, #0x0
mov r5, r7
add r5, #0x7d
.L94:
mov r1, #0x0
lsl r4, r2, #0x10
asr r3, r4, #0xe
.L9a:
lsl r0, r1, #0x10
asr r0, r0, #0x10
add r1, r0, r3
add r2, r5, r1
add r1, sp, r1
ldrb r1, [r1, #0x0]
strb r1, [r2, #0x0]
add r0, #0x1
lsl r0, r0, #0x10
lsr r1, r0, #0x10
asr r0, r0, #0x10
cmp r0, #0x3
ble .L9a
mov r1, #0x80
lsl r1, r1, #0x9
add r0, r4, r1
lsr r2, r0, #0x10
asr r0, r0, #0x10
cmp r0, #0x3
ble .L94
add sp, #0x10
pop {r3, r4, r5}
mov r8, r3
mov r9, r4
mov r10, r5
pop {r4, r5, r6, r7}
pop {r0}
bx r0
.hword #0x0
.word gUnknown_080D03C8
.word #0x3a1
```

# Primary Objective

Decompile the following target assembly function from `asm/code.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
	thumb_func_start sub_8090930
sub_8090930: @ 0x08090930
	push {lr}
	adds r3, r0, #0
	adds r0, #0xec
	ldr r2, _08090964 @ =gUnknown_080D7194
	ldrb r1, [r3]
	lsls r1, r1, #3
	adds r1, r1, r2
	ldrh r1, [r1]
	strh r1, [r0, #0xc]
	ldrb r1, [r3]
	lsls r1, r1, #3
	adds r1, r1, r2
	ldrb r1, [r1, #2]
	strb r1, [r0, #0x1a]
	adds r1, r3, #0
	adds r1, #0x40
	ldrh r1, [r1]
	strh r1, [r0, #0x10]
	adds r1, r3, #0
	adds r1, #0x42
	ldrh r1, [r1]
	strh r1, [r0, #0x12]
	bl DisplaySprite
	pop {r0}
	bx r0
	.align 2, 0
_08090964: .4byte gUnknown_080D7194

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
