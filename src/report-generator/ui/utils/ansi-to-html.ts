const ANSI_FOREGROUND_COLORS: Record<number, string> = {
  30: '#000000',
  31: '#cc0000',
  32: '#4e9a06',
  33: '#c4a000',
  34: '#3465a4',
  35: '#75507b',
  36: '#06989a',
  37: '#d3d7cf',
  90: '#555753',
  91: '#ef2929',
  92: '#8ae234',
  93: '#fce94f',
  94: '#729fcf',
  95: '#ad7fa8',
  96: '#34e2e2',
  97: '#eeeeec',
};

const ANSI_BACKGROUND_COLORS: Record<number, string> = {
  40: '#000000',
  41: '#cc0000',
  42: '#4e9a06',
  43: '#c4a000',
  44: '#3465a4',
  45: '#75507b',
  46: '#06989a',
  47: '#d3d7cf',
  100: '#555753',
  101: '#ef2929',
  102: '#8ae234',
  103: '#fce94f',
  104: '#729fcf',
  105: '#ad7fa8',
  106: '#34e2e2',
  107: '#eeeeec',
};

interface AnsiState {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  fgColor: string | null;
  bgColor: string | null;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function buildSpan(state: AnsiState, text: string): string {
  const escaped = escapeHtml(text);
  if (!escaped) {
    return '';
  }

  const styles: string[] = [];
  if (state.bold) {
    styles.push('font-weight:bold');
  }
  if (state.dim) {
    styles.push('opacity:0.5');
  }
  if (state.italic) {
    styles.push('font-style:italic');
  }
  if (state.underline) {
    styles.push('text-decoration:underline');
  }
  if (state.fgColor) {
    styles.push(`color:${state.fgColor}`);
  }
  if (state.bgColor) {
    styles.push(`background-color:${state.bgColor}`);
  }

  if (styles.length === 0) {
    return escaped;
  }

  return `<span style="${styles.join(';')}">${escaped}</span>`;
}

function applyCarriageReturns(text: string): string {
  const lines = text.split('\n');
  const processed = lines.map((line) => {
    if (!line.includes('\r')) {
      return line;
    }
    // Split by \r and take the last non-empty segment (carriage return overwrites from start)
    const segments = line.split('\r');
    for (let i = segments.length - 1; i >= 0; i--) {
      const trimmed = segments[i].replace(/\s+$/, '');
      if (trimmed.length > 0) {
        return segments[i];
      }
    }
    return segments[segments.length - 1];
  });
  return processed.join('\n');
}

/**
 * Returns true if the text contains ANSI escape sequences.
 */
export function containsAnsiCodes(text: string): boolean {
  return /\x1b\[/.test(text);
}

/**
 * Converts text containing ANSI escape codes to HTML with inline styles.
 * Handles carriage returns, backspaces, and common SGR parameters.
 */
export function ansiToHtml(text: string): string {
  // Pre-process: handle carriage returns and backspaces
  let processed = applyCarriageReturns(text);
  // Handle backspaces (\x08)
  while (processed.includes('\x08')) {
    processed = processed.replace(/[^\x08]\x08/, '');
    // If only backspaces remain at start, just remove them
    processed = processed.replace(/^\x08+/, '');
  }

  const result: string[] = [];
  const state: AnsiState = {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    fgColor: null,
    bgColor: null,
  };

  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match;

  while ((match = ansiRegex.exec(processed)) !== null) {
    // Emit text before this escape sequence
    if (match.index > lastIndex) {
      result.push(buildSpan(state, processed.slice(lastIndex, match.index)));
    }
    lastIndex = match.index + match[0].length;

    // Parse SGR parameters
    const params = match[1] ? match[1].split(';').map(Number) : [0];
    for (const param of params) {
      if (param === 0) {
        state.bold = false;
        state.dim = false;
        state.italic = false;
        state.underline = false;
        state.fgColor = null;
        state.bgColor = null;
      } else if (param === 1) {
        state.bold = true;
      } else if (param === 2) {
        state.dim = true;
      } else if (param === 3) {
        state.italic = true;
      } else if (param === 4) {
        state.underline = true;
      } else if (param === 22) {
        state.bold = false;
        state.dim = false;
      } else if (param === 23) {
        state.italic = false;
      } else if (param === 24) {
        state.underline = false;
      } else if (ANSI_FOREGROUND_COLORS[param]) {
        state.fgColor = ANSI_FOREGROUND_COLORS[param];
      } else if (param === 39) {
        state.fgColor = null;
      } else if (ANSI_BACKGROUND_COLORS[param]) {
        state.bgColor = ANSI_BACKGROUND_COLORS[param];
      } else if (param === 49) {
        state.bgColor = null;
      }
    }
  }

  // Emit remaining text
  if (lastIndex < processed.length) {
    result.push(buildSpan(state, processed.slice(lastIndex)));
  }

  return result.join('');
}
