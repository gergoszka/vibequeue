import { useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';
import type { Guest } from '../types';

interface GuestJoinFormProps {
  roomCode: string;
}

interface JoinRoomResponse {
  guestId: string;
  displayName: string;
  tokensRemaining: number;
}

export default function GuestJoinForm({ roomCode }: GuestJoinFormProps) {
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { setGuest } = useRoom();
  const { post } = useApi();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length > 30) return;

    setLoading(true);
    setError(null);
    try {
      const data = await post<JoinRoomResponse>('/api/rooms/join', { code: roomCode, displayName: trimmed });
      const guest: Guest = { guestId: data.guestId, displayName: data.displayName, tokensRemaining: data.tokensRemaining };
      setGuest(guest);
    } catch (err) {
      setError((err as Error).message || 'Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12 space-y-4">
      <h2 className="text-xl font-bold text-white text-center">Join Room {roomCode}</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Your display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
            maxLength={30}
            placeholder="e.g. DJ Alex"
            className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>
        {error && <ErrorMessage message={error} />}
        <button
          type="submit"
          disabled={loading || !displayName.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
        >
          {loading ? <LoadingSpinner /> : 'Join Room'}
        </button>
      </form>
    </div>
  );
}
