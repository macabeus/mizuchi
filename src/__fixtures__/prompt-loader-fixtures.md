# prompt-loader test fixtures

## test-function.obj

A minimal 32-bit x86 COFF object file (the format produced by Microsoft
Visual C++). It contains a single `.text` section holding one `ret`
instruction and one external function symbol named `?test_func@@YAXXZ`
(the MSVC-decorated name of `void __cdecl test_func(void)`).

Used to verify that prompt loading works with non-ELF object files and
MSVC-mangled symbol names (matching decompilation of Windows binaries).

Generated with a hand-rolled COFF writer (see git history of the spec
file for the generator snippet).
