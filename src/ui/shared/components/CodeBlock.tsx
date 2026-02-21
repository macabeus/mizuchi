import { common, createStarryNight } from '@wooorm/starry-night';
import gasAsm from '@wooorm/starry-night/source.x86';
import { useEffect, useRef, useState } from 'react';

import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  code: string;
  language: string;
  maxHeight?: string;
}

const grammars = [...common, gasAsm];

function getScopeForLanguage(lang: string): string {
  switch (lang) {
    case 'asm':
      return 'source.x86';
    case 'c':
      return 'source.c';
    case 'json':
      return 'source.json';
    case 'diff':
      return 'source.diff';
    case 'shell':
      return 'source.shell';
    case 'markdown':
      return 'text.md';
    default:
      return 'text.plain';
  }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toHtml(node: any): string {
  if (node.type === 'text') {
    return escapeHtml(node.value);
  }

  if (node.type === 'element') {
    const className = node.properties?.className?.join(' ') || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = node.children?.map((child: any) => toHtml(child)).join('') || '';
    return `<span class="${className}">${children}</span>`;
  }

  if (node.type === 'root') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return node.children?.map((child: any) => toHtml(child)).join('') || '';
  }

  return '';
}

export function CodeBlock({ code, language, maxHeight = '400px' }: CodeBlockProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');
  const starryNightRef = useRef<Awaited<ReturnType<typeof createStarryNight>> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initStarryNight() {
      if (!starryNightRef.current) {
        starryNightRef.current = await createStarryNight(grammars);
      }

      if (!mounted) {
        return;
      }

      const scope = getScopeForLanguage(language);
      const tree = starryNightRef.current.highlight(code, scope);
      const html = toHtml(tree);
      setHighlightedCode(html);
    }

    initStarryNight();

    return () => {
      mounted = false;
    };
  }, [code, language]);

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
        <code dangerouslySetInnerHTML={{ __html: highlightedCode || escapeHtml(code) }} />
      </pre>
    </div>
  );
}
