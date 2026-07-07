import type { QueueEntry } from '../types';

interface QueueEntryProps {
  entry: QueueEntry;
  index: number;
  onRemove?: (id: string) => void;
}

export default function QueueEntryComponent({ entry, index, onRemove }: QueueEntryProps) {
  const { title, thumbnailUrl, addedByDisplayName } = entry;

  const thumbnailFallback = 'https://via.placeholder.com/120x68/374151/9CA3AF?text=♪';

  const isPlaylist = entry.source === 'playlist';

  return (
    <div className={`flex items-center gap-3 rounded-lg p-2 ${isPlaylist ? 'bg-gray-800/50' : 'bg-gray-800'}`}>
      <span className="text-gray-500 text-sm w-5 text-center shrink-0">
        {isPlaylist ? <span className="text-gray-600 text-xs">♫</span> : index}
      </span>
      <img
        src={thumbnailUrl ?? thumbnailFallback}
        alt={title}
        loading="lazy"
        className="w-20 h-12 object-cover rounded shrink-0"
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = thumbnailFallback; }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{title}</p>
        <p className="text-gray-400 text-xs truncate">Added by {addedByDisplayName}</p>
      </div>
      {onRemove && (
        <button
          onClick={() => onRemove(entry.id)}
          className="text-gray-500 hover:text-red-400 transition shrink-0 p-1"
          title="Remove from queue"
          aria-label={`Remove ${title}`}
        >
          &#x2715;
        </button>
      )}
    </div>
  );
}
