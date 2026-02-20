import { common, createStarryNight } from '@wooorm/starry-night';
import { useEffect, useRef, useState } from 'react';

import { ansiToHtml, containsAnsiCodes } from '../utils/ansi-to-html';
import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  code: string;
  language: string;
  maxHeight?: string;
}

export function CodeBlock({ code, language, maxHeight = '400px' }: CodeBlockProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');
  const starryNightRef = useRef<Awaited<ReturnType<typeof createStarryNight>> | null>(null);

  useEffect(() => {
    if (containsAnsiCodes(code)) {
      setHighlightedCode(ansiToHtml(code));
      return;
    }

    let mounted = true;

    async function initStarryNight() {
      if (!starryNightRef.current) {
        starryNightRef.current = await createStarryNight(common);
      }

      if (!mounted) return;

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

  const getScopeForLanguage = (lang: string): string => {
    switch (lang) {
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
  };

  // Convert starry-night tree to HTML string
  const toHtml = (node: any): string => {
    if (node.type === 'text') {
      return escapeHtml(node.value);
    }

    if (node.type === 'element') {
      const className = node.properties?.className?.join(' ') || '';
      const children = node.children?.map((child: any) => toHtml(child)).join('') || '';
      return `<span class="${className}">${children}</span>`;
    }

    if (node.type === 'root') {
      return node.children?.map((child: any) => toHtml(child)).join('') || '';
    }

    return '';
  };

  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

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
