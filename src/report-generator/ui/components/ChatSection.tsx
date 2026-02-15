import { common, createStarryNight } from '@wooorm/starry-night';
import { useEffect, useRef, useState } from 'react';

import type { ReportChatMessage, ReportContentBlock } from '../../types';
import { Icon } from './Icon';

interface ChatSectionProps {
  messages: ReportChatMessage[];
}

export function ChatSection({ messages }: ChatSectionProps) {
  return (
    <div className="space-y-4">
      {messages.map((msg, i) => {
        if (msg.role === 'system') {
          return (
            <div key={i} className="flex justify-center">
              <div className="w-full max-w-[95%] rounded-xl overflow-hidden bg-gradient-to-br from-purple-900/10 to-purple-900/15 border border-purple-500/20">
                <div className="px-4 py-2 border-b bg-purple-600/10 border-purple-500/20">
                  <div className="flex items-center justify-center gap-2">
                    <Icon name="settings" className="w-4 h-4 text-purple-300" />
                    <span className="text-xs font-medium text-purple-300">System Prompt</span>
                  </div>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto [scrollbar-width:thin]">
                  <MessageContentRenderer content={msg.content} />
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl overflow-hidden ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/30'
                  : 'bg-gradient-to-br from-slate-700/50 to-slate-800/50 border border-slate-600/30'
              }`}
            >
              {/* Role header */}
              <div
                className={`px-4 py-2 border-b ${
                  msg.role === 'user' ? 'bg-blue-600/10 border-blue-500/20' : 'bg-slate-700/30 border-slate-600/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  {msg.role === 'user' ? (
                    <Icon name="user" className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Icon name="computer" className="w-4 h-4 text-cyan-400" />
                  )}
                  <span className={`text-xs font-medium ${msg.role === 'user' ? 'text-blue-400' : 'text-cyan-400'}`}>
                    {msg.role === 'user' ? 'User' : 'Claude'}
                  </span>
                </div>
              </div>

              {/* Message content */}
              <div className="p-4 max-h-[600px] overflow-y-auto [scrollbar-width:thin]">
                <MessageContentRenderer content={msg.content} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface MessageContentRendererProps {
  content: string | ReportContentBlock[];
}

/**
 * Renders message content, handling both string and content blocks
 */
function MessageContentRenderer({ content }: MessageContentRendererProps) {
  if (typeof content === 'string') {
    return <TextContent text={content} />;
  }

  return (
    <div className="space-y-3">
      {content.map((block, i) => (
        <ContentBlockRenderer key={i} block={block} />
      ))}
    </div>
  );
}

interface ContentBlockRendererProps {
  block: ReportContentBlock;
}

/**
 * Renders a single content block
 */
function ContentBlockRenderer({ block }: ContentBlockRendererProps) {
  if (block.type === 'text') {
    return <TextContent text={block.text} />;
  }

  if (block.type === 'tool_use') {
    return (
      <div className="rounded-lg bg-slate-900/50 border border-slate-600/30 overflow-hidden">
        <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-600/30 flex items-center gap-2">
          <Icon name="bolt" className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-medium text-amber-400">Tool: {block.name}</span>
          <span className="text-xs text-slate-500 ml-auto font-mono">{block.id.slice(0, 8)}...</span>
        </div>
        <div className="p-3">
          <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  if (block.type === 'tool_result') {
    return (
      <div className="rounded-lg bg-slate-900/50 border border-slate-600/30 overflow-hidden">
        <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-600/30 flex items-center gap-2">
          <Icon name="checkCircle" className="w-4 h-4 text-green-400" />
          <span className="text-xs font-medium text-green-400">Tool Result</span>
          <span className="text-xs text-slate-500 ml-auto font-mono">{block.tool_use_id.slice(0, 8)}...</span>
        </div>
        <div className="p-3 max-h-[300px] overflow-y-auto [scrollbar-width:thin]">
          <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">{block.content}</pre>
        </div>
      </div>
    );
  }

  return null;
}

interface TextContentProps {
  text: string;
}

/**
 * Renders text content as syntax-highlighted markdown
 */
function TextContent({ text }: TextContentProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const starryNightRef = useRef<Awaited<ReturnType<typeof createStarryNight>> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function highlightContent() {
      if (!starryNightRef.current) {
        starryNightRef.current = await createStarryNight(common);
      }

      if (!mounted) return;

      const tree = starryNightRef.current.highlight(text, 'text.md');
      const html = toHtml(tree);
      setHighlightedHtml(html);
    }

    highlightContent();

    return () => {
      mounted = false;
    };
  }, [text]);

  if (!highlightedHtml) {
    return <div className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">{text}</div>;
  }

  return (
    <div
      className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed"
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}

/**
 * Convert starry-night tree to HTML string
 */
function toHtml(tree: any): string {
  if (tree.type === 'text') {
    return escapeHtml(tree.value);
  }

  if (tree.type === 'element') {
    const className = tree.properties?.className ? ` class="${tree.properties.className.join(' ')}"` : '';
    const children = tree.children?.map(toHtml).join('') || '';
    return `<${tree.tagName}${className}>${children}</${tree.tagName}>`;
  }

  if (tree.children) {
    return tree.children.map(toHtml).join('');
  }

  return '';
}

/**
 * Escape HTML special characters
 */
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
