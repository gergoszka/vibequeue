import { useState, useEffect } from 'react';
import { useApi } from './useApi';

export function useSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const { get } = useApi();

  useEffect(() => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }

    const timerId = setTimeout(async () => {
      try {
        const data = await get<{ suggestions: string[] }>(
          `/api/search/suggestions?q=${encodeURIComponent(query.trim())}`
        );
        setSuggestions(data.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 150);

    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return { suggestions, clearSuggestions: () => setSuggestions([]) };
}
