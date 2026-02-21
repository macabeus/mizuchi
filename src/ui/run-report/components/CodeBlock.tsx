import { CodeBlock as SharedCodeBlock } from '@ui-shared/components/CodeBlock';

import { containsAnsiCodes } from '../utils/ansi-to-html';
import { AnsiCodeBlock } from './AnsiCodeBlock';

interface CodeBlockProps {
  code: string;
  language: string;
  maxHeight?: string;
}

export function CodeBlock({ code, language, maxHeight = '400px' }: CodeBlockProps) {
  if (containsAnsiCodes(code)) {
    return <AnsiCodeBlock code={code} maxHeight={maxHeight} />;
  }

  return <SharedCodeBlock code={code} language={language} maxHeight={maxHeight} />;
}
