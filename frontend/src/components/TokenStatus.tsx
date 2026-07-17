import { useRoom } from '../contexts/RoomContext';

export default function TokenStatus() {
  const { isCreator, room, tokensRemaining, countdownDisplay, tokenStatusLoading: isLoading } = useRoom();

  // Creator doesn't use tokens
  if (isCreator) return null;
  if (isLoading) return <div className="h-10 bg-gray-800 rounded-lg animate-pulse w-40" />;

  const hasTokens = (tokensRemaining ?? 0) > 0;

  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-2 ${
      hasTokens ? 'bg-green-900 border border-green-700' : 'bg-red-900 border border-red-700'
    }`}>
      <span className={`text-sm font-semibold ${hasTokens ? 'text-green-300' : 'text-red-300'}`}>
        {tokensRemaining ?? 0}{room?.tokenAllowance != null ? ` / ${room.tokenAllowance}` : ''} tokens
      </span>
      {countdownDisplay && (
        <span className="text-gray-400 text-xs">Next in {countdownDisplay}</span>
      )}
    </div>
  );
}
