#!/usr/bin/env bash
# Setup script for m2c decompiler
# Creates a Python virtual environment and installs dependencies

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
M2C_DIR="$SCRIPT_DIR/../vendor/m2c"

if [ ! -d "$M2C_DIR" ]; then
  echo "Error: m2c not found at $M2C_DIR"
  echo "Run 'git submodule update --init' first."
  exit 1
fi

cd "$M2C_DIR"

echo "Creating Python virtual environment..."
python3 -m venv .venv

echo "Installing m2c dependencies..."
.venv/bin/pip install --quiet "graphviz~=0.20.1"

echo "m2c setup complete."
