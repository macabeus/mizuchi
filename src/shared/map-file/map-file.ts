/**
 * GNU ld map file parser.
 *
 * Extracts a mapping from function (symbol) names to their containing
 * object file paths by scanning `.text` section headers and the symbol
 * entries that follow them.
 */
import fs from 'fs/promises';
import path from 'path';

const SECTION_HEADER_RE = /^\s*\.text\s+0x[\da-f]+\s+0x[\da-f]+\s+(\S+\.o)/i;
const SYMBOL_RE = /^\s+0x[\da-f]+\s+(\S+)$/;

/**
 * Parse a GNU ld map file and return a map of symbol name → relative .o path.
 *
 * The returned paths are exactly as they appear in the map file (relative to
 * the linker's working directory, which may differ from the project root).
 */
export function parseMapFile(content: string): Map<string, string> {
  const result = new Map<string, string>();
  let currentObjectFile: string | null = null;

  for (const line of content.split('\n')) {
    const sectionMatch = line.match(SECTION_HEADER_RE);
    if (sectionMatch) {
      currentObjectFile = sectionMatch[1];
      continue;
    }

    if (currentObjectFile !== null) {
      const symbolMatch = line.match(SYMBOL_RE);
      if (symbolMatch) {
        let symbolName = symbolMatch[1];
        // Strip .NON_MATCHING suffix (some projects uses aliases like func.NON_MATCHING)
        symbolName = symbolName.replace(/\.NON_MATCHING$/, '');
        result.set(symbolName, currentObjectFile);
      } else {
        // Non-matching line → section boundary, reset
        currentObjectFile = null;
      }
    }
  }

  return result;
}

/**
 * Resolve a function name to an absolute object file path using the symbol map.
 *
 * The map file paths are relative to the linker's working directory, which may
 * differ from the project root. We try the direct path first (works for AF-style
 * projects), then glob under `<projectRoot>/build/` for the .o filename (handles
 * SA3-style where the linker runs from a build subdirectory).
 */
export async function resolveObjectPath(
  functionName: string,
  projectRoot: string,
  symbolMap: Map<string, string>,
): Promise<string | null> {
  const relativePath = symbolMap.get(functionName);
  if (!relativePath) {
    return null;
  }

  // Try direct join (works when map paths are relative to project root)
  const directPath = path.join(projectRoot, relativePath);
  try {
    await fs.access(directPath);
    return directPath;
  } catch {
    // Not found at direct path — try globbing under build/
  }

  const fileName = path.basename(relativePath);
  const buildDir = path.join(projectRoot, 'build');
  for await (const match of fs.glob(`**/${fileName}`, { cwd: buildDir })) {
    return path.join(buildDir, match);
  }

  return null;
}

/**
 * Resolve a C source file path to an absolute object file path.
 *
 * Used as a fallback when a function name isn't in the symbol map
 * (e.g., static functions that the linker doesn't export).
 * Tries replacing .c → .o and looking for the file directly or under build/.
 */
export async function resolveObjectPathFromSourceFile(
  cModulePath: string,
  projectRoot: string,
): Promise<string | null> {
  const objRelativePath = cModulePath.replace(/\.c$/, '.o');

  // Try direct path (same directory structure as source)
  const directPath = path.join(projectRoot, objRelativePath);
  try {
    await fs.access(directPath);
    return directPath;
  } catch {
    // Not found — try under build/
  }

  // Glob for the .o filename under build/
  const fileName = path.basename(objRelativePath);
  const buildDir = path.join(projectRoot, 'build');
  try {
    for await (const match of fs.glob(`**/${fileName}`, { cwd: buildDir })) {
      return path.join(buildDir, match);
    }
  } catch {
    // build/ doesn't exist or isn't accessible
  }

  return null;
}
