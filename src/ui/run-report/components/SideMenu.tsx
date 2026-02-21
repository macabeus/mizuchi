import { Icon, IconName } from '@ui-shared/components/Icon';
import { WithTooltip } from '@ui-shared/components/WithTooltip';
import { useState } from 'react';

type SideMenuItem =
  | {
      id: string;
      type: 'button';
      label: string;
      icon: IconName;
      disabled?: boolean;
      tooltip?: string;
    }
  | {
      id: string;
      type: 'divider';
    };

interface SideMenuProps<T extends SideMenuItem> {
  items: T[];
  content: (item: T, index: number) => React.ReactNode;
  defaultActiveId?: string;
  className?: string;
}

export function SideMenu<T extends SideMenuItem>({ items, content, defaultActiveId, className }: SideMenuProps<T>) {
  const defaultIndex = defaultActiveId
    ? Math.max(
        0,
        items.findIndex((item) => item.id === defaultActiveId),
      )
    : 0;
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  if (items.length === 0) {
    return null;
  }

  const activeItem = items[activeIndex];

  return (
    <div className={`flex ${className ?? ''}`}>
      {/* Vertical Tab Bar */}
      <div className="shrink-0 bg-slate-900/40 border-r border-slate-700">
        <div className="flex flex-col gap-1 p-2">
          {items.map((item, index) => {
            if (item.type === 'divider') {
              return <hr key={index} className="border-slate-700 my-2" />;
            }

            const button = (
              <button
                key={item.id}
                onClick={() => {
                  if (!item.disabled) {
                    setActiveIndex(index);
                  }
                }}
                className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-2 border text-left ${
                  item.disabled
                    ? 'text-slate-600 cursor-not-allowed border-transparent'
                    : activeIndex === index
                      ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-lg'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 border-transparent'
                }`}
                disabled={item.disabled}
              >
                <Icon name={item.icon} className="w-4 h-4" />
                {item.label}
              </button>
            );

            if (item.disabled && item.tooltip) {
              return (
                <WithTooltip key={item.id} tooltip={item.tooltip}>
                  {button}
                </WithTooltip>
              );
            }

            return button;
          })}
        </div>
      </div>

      {/* Content Panel */}
      <div className="flex-1 min-w-0">{content(activeItem, activeIndex)}</div>
    </div>
  );
}
