import { useState, useEffect } from 'react';
import { vocabDb, type VocabWord } from '@/lib/indexeddb';

interface UseVocabularyReturn {
  words: VocabWord[];
  addWord: (word: VocabWord) => Promise<void>;
  removeWord: (id: string) => Promise<void>;
  hasWord: (id: string) => Promise<boolean>;
  isLoading: boolean;
}

/**
 * Hook to manage vocabulary words stored in IndexedDB.
 * Loads all words on mount and provides add/remove/hasWord helpers.
 */
export function useVocabulary(): UseVocabularyReturn {
  const [words, setWords] = useState<VocabWord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load all words on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = (await vocabDb.getAllWords?.()) ?? [];
        if (mounted) setWords(data as VocabWord[]);
      } catch (e) {
        // Ignore load errors; UI can handle empty state
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const addWord = async (word: VocabWord) => {
    try {
      await vocabDb.addWord?.(word);
      setWords((prev) => [...prev, word]);
    } catch (e) {
      throw e;
    }
  };

  const removeWord = async (id: string) => {
    try {
      await vocabDb.removeWord?.(id);
      setWords((prev) => prev.filter((w) => w.id !== id));
    } catch (e) {
      throw e;
    }
  };

  const hasWord = async (id: string): Promise<boolean> => {
    // Prefer database check if available; fallback to in-memory
    try {
      const exists = await vocabDb.hasWord?.(id);
      if (typeof exists === 'boolean') return exists;
    } catch {
      // ignore and fallback
    }
    return words.some((w) => w.id === id);
  };

  return {
    words,
    addWord,
    removeWord,
    hasWord,
    isLoading,
  };
}
