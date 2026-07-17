import { useState, useEffect, useRef } from 'react';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SongProgressBarProps {
  startedPlayingAt: number | null;
  durationSeconds: number | null;
  isPaused?: boolean;
}

export default function SongProgressBar({ startedPlayingAt, durationSeconds, isPaused }: SongProgressBarProps) {
  const [elapsed, setElapsed] = useState(() =>
    startedPlayingAt ? Math.max(0, Math.floor((Date.now() - startedPlayingAt) / 1000)) : 0
  );
  const pausedOffsetRef = useRef(0);   // total ms spent paused
  const pausedSinceRef = useRef<number | null>(null);  // wall-clock when current pause started

  // Reset offset tracking when a new song starts
  useEffect(() => {
    pausedOffsetRef.current = 0;
    pausedSinceRef.current = null;
    setElapsed(startedPlayingAt ? Math.max(0, Math.floor((Date.now() - startedPlayingAt) / 1000)) : 0);
  }, [startedPlayingAt]);

  // Accumulate paused duration on each pause/resume transition
  useEffect(() => {
    if (isPaused) {
      pausedSinceRef.current = Date.now();
    } else if (pausedSinceRef.current !== null) {
      pausedOffsetRef.current += Date.now() - pausedSinceRef.current;
      pausedSinceRef.current = null;
    }
  }, [isPaused]);

  // Tick — stops while paused
  useEffect(() => {
    if (!startedPlayingAt || isPaused) return;
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedPlayingAt - pausedOffsetRef.current) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedPlayingAt, isPaused]);

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
