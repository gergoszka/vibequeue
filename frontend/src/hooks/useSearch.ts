import { useState, useCallback } from 'react';
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
  search: (overrideQuery?: string) => void;
  clearSearch: () => void;
} {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { get } = useApi();

  // overrideQuery lets callers pass a freshly-picked suggestion before state has updated
  const search = useCallback((overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q || q.length < 2) return;
    setIsLoading(true);
    setResults([]);
    setError(null);
    get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&roomCode=${roomCode}`)
      .then((data) => setResults(data.results || []))
      .catch(() => { setError('Search failed, try again'); setResults([]); })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, roomCode]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return { query, setQuery, results, isLoading, error, search, clearSearch };
}
