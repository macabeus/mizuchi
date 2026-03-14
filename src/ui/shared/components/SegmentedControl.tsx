import { Icon, type IconName } from './Icon';

export interface SegmentedControlItem<T extends string = string> {
  id: T;
  label: string;
  icon: IconName;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  items: SegmentedControlItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ items, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="flex items-center bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/50">
      {items.map((item) => {
        const isActive = item.id === value;
        const isDisabled = item.disabled ?? false;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => !isDisabled && onChange(item.id)}
            disabled={isDisabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              isDisabled
                ? 'text-slate-600 cursor-not-allowed'
                : isActive
                  ? 'bg-slate-700/80 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon name={item.icon} className="w-3.5 h-3.5" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
