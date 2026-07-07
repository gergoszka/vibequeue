import { useRoom } from '../contexts/RoomContext';

export default function TokenStatus() {
  const { isCreator, tokensRemaining, countdownDisplay, tokenStatusLoading: isLoading } = useRoom();

  // Creator doesn't use tokens
  if (isCreator) return null;
  if (isLoading) return <div className="h-10 bg-gray-800 rounded-lg animate-pulse w-40" />;

  const hasTokens = (tokensRemaining ?? 0) > 0;

  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-2 ${
      hasTokens ? 'bg-green-900 border border-green-700' : 'bg-red-900 border border-red-700'
    }`}>
      {/* Token circles */}
      <div className="flex gap-1">
        {Array.from({ length: Math.min(tokensRemaining ?? 0, 5) }).map((_, i) => (
          <span key={i} className="w-3 h-3 rounded-full bg-green-400" />
        ))}
        {tokensRemaining === 0 && (
          <span className="w-3 h-3 rounded-full bg-gray-600" />
        )}
      </div>

      {/* Text */}
      <div className="text-sm">
        {hasTokens ? (
          <span className="text-green-300 font-semibold">
            {tokensRemaining} {tokensRemaining === 1 ? 'token' : 'tokens'} remaining
          </span>
        ) : (
          <span className="text-red-300 font-semibold">Waiting for next token</span>
        )}
        {countdownDisplay && (
          <span className="text-gray-400 ml-2 text-xs">
            Next in {countdownDisplay}
          </span>
        )}
      </div>
    </div>
  );
}
