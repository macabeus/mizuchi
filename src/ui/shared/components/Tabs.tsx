import { useState } from 'react';

import { Icon, IconName } from './Icon';

interface TabItem {
  id: string;
  name: React.ReactNode;
  icon?: IconName;
}

interface TabsProps<T extends TabItem> {
  items: T[];
  content: (tab: T, index: number) => React.ReactNode;
  className?: string;
  onTabChange?: (index: number) => void;
}

export function Tabs<T extends TabItem>({ items, content, className, onTabChange }: TabsProps<T>) {
  const [activeTab, setActiveTab] = useState(0);

  if (items.length === 0) {
    return null;
  }

  const handleTabClick = (index: number) => {
    setActiveTab(index);
    onTabChange?.(index);
  };

  return (
    <div className={className}>
      {/* Tab Headers */}
      <div className="bg-slate-900/25">
        <div className="flex gap-1 p-2 overflow-x-auto [scrollbar-width:thin]">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleTabClick(index)}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-2 border ${
                activeTab === index
                  ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-lg'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 border-transparent'
              }`}
            >
              {item.icon && <Icon name={item.icon} className="w-4 h-4" />}
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>{content(items[activeTab], activeTab)}</div>
    </div>
  );
}
