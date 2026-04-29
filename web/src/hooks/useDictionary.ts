import { useState, useCallback } from 'react';
import { searchJisho, type JishoWord } from '@/lib/jisho';

interface UseDictionaryReturn {
  search: (word: string) => Promise<void>;
  result: JishoWord | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to search Jisho for a given word and expose the first result.
 */
export function useDictionary(): UseDictionaryReturn {
  const [result, setResult] = useState<JishoWord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (word: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await searchJisho(word);
      // Keep only the first matching entry for simplicity
      setResult(data && data.length > 0 ? data[0] : null);
    } catch (err) {
      setError((err as Error)?.message ?? 'Unknown error');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    search,
    result,
    isLoading,
    error,
  };
}
