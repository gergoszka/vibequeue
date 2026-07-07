import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import { SearchResult } from '../types';

interface SearchResponse {
  results: SearchResult[];
}

export function useSearch(roomCode: string | undefined): {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  clearSearch: () => void;
} {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { get } = useApi();

  // Debounced search: fires 300ms after the last query change
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);

    const timerId = setTimeout(async () => {
      try {
        const data = await get<SearchResponse>(`/api/search?q=${encodeURIComponent(query.trim())}&roomCode=${roomCode}`);
        setResults(data.results || []);
      } catch {
        setError('Search failed, try again');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timerId);
  }, [query, roomCode]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return { query, setQuery, results, isLoading, error, clearSearch };
}
