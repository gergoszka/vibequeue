import { useState, useEffect } from 'react';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SongProgressBarProps {
  startedPlayingAt: number | null;
  durationSeconds: number | null;
}

export default function SongProgressBar({ startedPlayingAt, durationSeconds }: SongProgressBarProps) {
  const [elapsed, setElapsed] = useState(() =>
    startedPlayingAt ? Math.max(0, Math.floor((Date.now() - startedPlayingAt) / 1000)) : 0
  );

  useEffect(() => {
    if (!startedPlayingAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedPlayingAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedPlayingAt]);

  if (!durationSeconds) return null;

  const clamped = Math.min(elapsed, durationSeconds);
  const percent = (clamped / durationSeconds) * 100;
  const remaining = Math.max(0, durationSeconds - clamped);

  return (
    <div className="mt-3">
      <div className="w-full bg-gray-700 rounded-full h-1">
        <div
          className="bg-green-400 h-1 rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{formatTime(clamped)}</span>
        <span>-{formatTime(remaining)}</span>
      </div>
    </div>
  );
}
