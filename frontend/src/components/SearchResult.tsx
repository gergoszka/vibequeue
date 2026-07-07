import type { SearchResult } from '../types';

// Formats durationSeconds → "M:SS" (e.g. 225 → "3:45")
function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

interface SearchResultProps {
  result: SearchResult;
  onAdd: (result: SearchResult) => void;
  isAdding: boolean;
  isDisabled: boolean;
  disabledReason?: string;
}

export default function SearchResultComponent({ result, onAdd, isAdding, isDisabled, disabledReason }: SearchResultProps) {
  const { title, thumbnailUrl, channelTitle, durationSeconds } = result;
  const thumbnailFallback = 'https://via.placeholder.com/120x68/374151/9CA3AF?text=♪';

  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-2">
      <img
        src={thumbnailUrl ?? thumbnailFallback}
        alt={title}
        loading="lazy"
        className="w-20 h-12 object-cover rounded shrink-0"
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = thumbnailFallback; }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{title}</p>
        <p className="text-gray-400 text-xs">{channelTitle} {durationSeconds ? `· ${formatDuration(durationSeconds)}` : ''}</p>
      </div>
      <button
        onClick={() => onAdd(result)}
        disabled={isDisabled || isAdding}
        title={disabledReason ?? ''}
        className={`shrink-0 px-3 py-1 rounded-lg text-sm font-semibold transition ${
          isDisabled
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {isAdding ? '...' : 'Add'}
      </button>
    </div>
  );
}
