import type { WsStatus } from '../types';

interface ConnectionStatusProps {
  status: WsStatus;
}

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  const config: Record<WsStatus, { dot: string; text: string }> = {
    connected: { dot: 'bg-green-500', text: '' }, // Don't show when connected — clean UI
    connecting: { dot: 'bg-yellow-500 animate-pulse', text: 'Connecting...' },
    reconnecting: { dot: 'bg-yellow-400 animate-pulse', text: 'Reconnecting...' },
    offline: { dot: 'bg-red-500', text: 'Offline — limited sync' },
  };
  const c = config[status];
  if (status === 'connected') return null; // Hide when all is well

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 rounded-full px-3 py-1">
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      <span>{c.text}</span>
    </div>
  );
}
