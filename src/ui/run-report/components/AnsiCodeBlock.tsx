import { CopyButton } from '@ui-shared/components/CopyButton';

import { ansiToHtml } from '../utils/ansi-to-html';

interface AnsiCodeBlockProps {
  code: string;
  maxHeight?: string;
}

export function AnsiCodeBlock({ code, maxHeight = '400px' }: AnsiCodeBlockProps) {
  return (
    <div className="relative group">
      <CopyButton
        text={code}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600 z-10"
      />

      <pre
        className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm scroll-thin"
        style={{ scrollbarWidth: 'thin', maxHeight }}
      >
        <code dangerouslySetInnerHTML={{ __html: ansiToHtml(code) }} />
      </pre>
    </div>
  );
}
