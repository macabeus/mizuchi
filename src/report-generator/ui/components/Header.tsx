import logoUrl from '../assets/logo.png';
import { Icon } from './Icon';

interface HeaderProps {
  timestamp: string;
}

export function Header({ timestamp }: HeaderProps) {
  const formattedDate = new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedTime = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl shadow-xl mb-8 overflow-hidden">
      <div className="px-8 py-6">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
              <img src={logoUrl} alt="Mizuchi Logo" className="relative w-16 h-16 object-contain drop-shadow-lg" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  Mizuchi
                </span>
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5">Matching Decompilation Pipeline Runner</p>
            </div>
          </div>

          {/* Timestamp */}
          <div className="text-right">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <Icon name="calendar" className="w-4 h-4" />
              <span className="text-sm font-medium">Report generated at</span>
            </div>
            <p className="text-white font-semibold">{formattedDate}</p>
            <p className="text-slate-300 text-sm">{formattedTime}</p>
          </div>
        </div>
      </div>

      {/* Decorative bottom border */}
      <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500" />
    </header>
  );
}
