import { useState } from 'react';

import { Icon } from './Icon';

interface CopyButtonProps {
  text: string;
  className: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className={`flex gap-2 ${className}`}>
      <Icon name="copy" className="w-3.5 h-3.5" />

      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
