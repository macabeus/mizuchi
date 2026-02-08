You are decompiling an assembly function called `TaskDestructor_805C03C` in ARMv4T from a Game Boy Advance game using the old C compiler called agbcc.

# Examples

## `TaskDestructor_804B44C`

```c
static void TaskDestructor_804B44C(struct Task *t) { }
```

```asm
bx lr
```

## `UnusedFunc`

```c
UNUSED static void UnusedFunc(void) { }
```

```asm
bx lr
```

## `sub_804B4DC`

```c
static void sub_804B4DC(void) { }
```

```asm
bx lr
```

## `TaskDestructor_IA081_082`

```c
void TaskDestructor_IA081_082(struct Task *t) { }
```

```asm
bx lr
```

## `TaskDestructor_Interactable015`

```c
void TaskDestructor_Interactable015(struct Task *t) { }
```

```asm
bx lr
```

# Primary Objective

Decompile the following target assembly function from `asm/enemy_unknown_code.s` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
    thumb_func_start TaskDestructor_805C03C
TaskDestructor_805C03C:
    bx lr
    .align 2 , 0

```

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
