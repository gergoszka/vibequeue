import { useState, useRef, useCallback } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useApi } from '../hooks/useApi';
import { useSearch } from '../hooks/useSearch';
import { useSuggestions } from '../hooks/useSuggestions';
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
  const { query, setQuery, results, isLoading, error, search, clearSearch } = useSearch(room?.code);
  const { suggestions, clearSuggestions } = useSuggestions(query);
  const { post } = useApi();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const addingRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pickSuggestion = useCallback((suggestion: string) => {
    setQuery(suggestion);
    clearSuggestions();
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
    search(suggestion);
  }, [setQuery, clearSuggestions, search]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && selectedSuggestion >= 0) {
        pickSuggestion(suggestions[selectedSuggestion]);
      } else {
        setShowSuggestions(false);
        search();
      }
      return;
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestion(-1);
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestion(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestion(i => Math.max(i - 1, -1));
    }
  }, [showSuggestions, suggestions, selectedSuggestion, pickSuggestion, search]);

  const hasTokens = tokensRemaining === null || tokensRemaining > 0;

  const handleClearSearch = useCallback(() => {
    clearSearch();
    clearSuggestions();
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
  }, [clearSearch, clearSuggestions]);

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
        <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
              setSelectedSuggestion(-1);
            }}
            onFocus={() => {
              if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
              setShowSuggestions(true);
            }}
            onBlur={() => {
              blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search for a song..."
            className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-4 py-2 pr-10 focus:outline-none focus:border-blue-500"
            autoComplete="off"
          />
          {query && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >&#x2715;</button>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg overflow-hidden shadow-lg z-20">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={() => pickSuggestion(s)}
                  className={`px-4 py-2 cursor-pointer text-sm flex items-center gap-2 ${
                    i === selectedSuggestion ? 'bg-gray-600 text-white' : 'text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={() => { setShowSuggestions(false); search(); }}
          disabled={isLoading || query.trim().length < 2}
          className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          aria-label="Search"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </button>
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
