import { useState, useRef } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useApi } from '../hooks/useApi';
import { useSearch } from '../hooks/useSearch';
import SearchResultComponent from './SearchResult';
import LoadingSpinner from './LoadingSpinner';
import type { SearchResult } from '../types';

interface SearchPanelProps {
  onSongAdded: () => void;
  tokensRemaining: number | null;
}

export default function SearchPanel({ onSongAdded, tokensRemaining }: SearchPanelProps) {
  // onSongAdded: called after a successful add, triggers queue refetch
  // tokensRemaining: number or null (null means creator = unlimited)
  const { room, refreshTokenStatus } = useRoom();
  const { query, setQuery, results, isLoading, error, clearSearch } = useSearch(room?.code);
  const { post } = useApi();
  const [addingId, setAddingId] = useState<string | null>(null);  // videoId currently being added
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set()); // brief "Added!" feedback
  const addingRef = useRef(false); // synchronous guard against double-tap before re-render

  const hasTokens = tokensRemaining === null || tokensRemaining > 0;

  const handleAdd = async (result: SearchResult) => {
    if (!hasTokens || addingRef.current) return;
    addingRef.current = true;
    setAddingId(result.videoId);
    try {
      await post<unknown>(`/api/rooms/${room?.code}/queue`, {
        youtubeVideoId: result.videoId,
        title: result.title,
        thumbnailUrl: result.thumbnailUrl,
        durationSeconds: result.durationSeconds,
      });
      setAddedIds(prev => new Set([...prev, result.videoId]));
      setTimeout(() => setAddedIds(prev => { const n = new Set(prev); n.delete(result.videoId); return n; }), 2000);
      onSongAdded();
      refreshTokenStatus();
      clearSearch();
    } catch (err) {
      console.error('Add to queue failed:', (err as Error).message);
    } finally {
      addingRef.current = false;
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search input — sticky on mobile */}
      <div className="sticky top-0 z-10 bg-gray-900 py-2">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder="Search for a song..."
            className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-4 py-2 pr-10 focus:outline-none focus:border-blue-500"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >&#x2715;</button>
          )}
        </div>
      </div>

      {/* Results area */}
      {isLoading && (
        <div className="flex justify-center py-4"><LoadingSpinner /></div>
      )}

      {error && !isLoading && (
        <p className="text-red-400 text-sm text-center">{error}</p>
      )}

      {!isLoading && !error && query.length >= 2 && results.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">No results found</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(result => (
            <SearchResultComponent
              key={result.videoId}
              result={result}
              onAdd={handleAdd}
              isAdding={addingId === result.videoId}
              isDisabled={!hasTokens || addedIds.has(result.videoId)}
              disabledReason={!hasTokens ? 'No tokens remaining' : addedIds.has(result.videoId) ? 'Added!' : ''}
            />
          ))}
        </div>
      )}
    </div>
  );
}
