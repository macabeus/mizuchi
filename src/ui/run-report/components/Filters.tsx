import { Icon } from '@ui-shared/components/Icon';

import type { ReportFilters, ReportSort } from '~/report-generator/types';

interface FiltersProps {
  filters: ReportFilters;
  sort: ReportSort;
  filterCounts: { all: number; success: number; failure: number };
  pluginNames: string[];
  onFiltersChange: (filters: ReportFilters) => void;
  onSortChange: (sort: ReportSort) => void;
}

export function Filters({ filters, sort, filterCounts, pluginNames, onFiltersChange, onSortChange }: FiltersProps) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-4 border border-slate-700">
      <div className="flex flex-wrap gap-4 items-center">
        {/* Outcome Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 font-medium">Filter:</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-600/50">
            <button
              onClick={() => onFiltersChange({ ...filters, outcome: 'all' })}
              className={`px-3 py-1.5 text-sm font-medium transition-all ${
                filters.outcome === 'all'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
              }`}
            >
              All ({filterCounts.all})
            </button>
            <button
              onClick={() => onFiltersChange({ ...filters, outcome: 'success' })}
              className={`px-3 py-1.5 text-sm font-medium transition-all border-l border-slate-600/50 ${
                filters.outcome === 'success'
                  ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
              }`}
            >
              Success ({filterCounts.success})
            </button>
            <button
              onClick={() => onFiltersChange({ ...filters, outcome: 'failure' })}
              className={`px-3 py-1.5 text-sm font-medium transition-all border-l border-slate-600/50 ${
                filters.outcome === 'failure'
                  ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
              }`}
            >
              Failed ({filterCounts.failure})
            </button>
          </div>
        </div>

        {/* Failed at Plugin Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 font-medium">Failed at:</span>
          <select
            value={filters.failedAtPlugin || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                failedAtPlugin: e.target.value || undefined,
              })
            }
            className="px-3 py-1.5 text-sm border border-slate-600/50 rounded-lg bg-slate-700/50 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          >
            <option value="">Any plugin</option>
            {pluginNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-slate-400 font-medium">Sort by:</span>
          <select
            value={`${sort.field}-${sort.direction}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('-') as [ReportSort['field'], ReportSort['direction']];
              onSortChange({ field, direction });
            }}
            className="px-3 py-1.5 text-sm border border-slate-600/50 rounded-lg bg-slate-700/50 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="duration-asc">Duration (Fastest)</option>
            <option value="duration-desc">Duration (Slowest)</option>
            <option value="status-asc">Status (Success first)</option>
            <option value="status-desc">Status (Failed first)</option>
          </select>
        </div>

        {/* Clear Filters */}
        {(filters.outcome !== 'all' || filters.failedAtPlugin) && (
          <button
            onClick={() => onFiltersChange({ outcome: 'all' })}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-600/50 rounded-lg transition-colors flex items-center gap-1"
          >
            <Icon name="close" className="w-4 h-4" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
