#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_NAME="${1:-base}"
CONTEXT_PATH="${2:-$DIR/context.h}"
COMPILER_FLAGS="${3:--mthumb-interwork -Wimplicit -Wparentheses -Werror -O2 -fhex-asm}"

# Detect OS and architecture to pick the right agbcc executable
if [[ "$OSTYPE" == "darwin"* ]]; then
  AGBCC="$DIR/agbcc/agbcc-mac-arm64"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  AGBCC="$DIR/agbcc/agbcc-linux-x86"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

rm -f "$DIR/${BASE_NAME}.o" "$DIR/${BASE_NAME}.s" "$DIR/${BASE_NAME}_combined.c"

# Create a combined file with context.h prepended
{ cat "$CONTEXT_PATH"; echo ""; echo "extern void _MIZUCHI_CONCATENATED_CODE();"; cat "$DIR/${BASE_NAME}.c"; } > "$DIR/${BASE_NAME}_combined.c"

# Strip multiline comments /* ... */ that the old compiler doesn't support
perl -0pe 's/\/\*.*?\*\///gs' "$DIR/${BASE_NAME}_combined.c" > "$DIR/${BASE_NAME}_combined_stripped.c"

# Preprocess with cpp to expand macros
cpp -P "$DIR/${BASE_NAME}_combined_stripped.c" "$DIR/${BASE_NAME}_preprocessed.c"

# Compile the preprocessed file with configurable flags
"$AGBCC" "$DIR/${BASE_NAME}_preprocessed.c" -o "$DIR/${BASE_NAME}.s" $COMPILER_FLAGS && \
arm-none-eabi-as "$DIR/${BASE_NAME}.s" -o "$DIR/${BASE_NAME}.o"
