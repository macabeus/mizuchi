/**
 * GNU ld map file parser.
 *
 * Extracts a mapping from function (symbol) names to their containing
 * object file paths by scanning `.text` section headers and the symbol
 * entries that follow them.
 */

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
