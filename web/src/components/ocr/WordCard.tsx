import { Button } from '@/components/ui/button';
import { JishoWord } from '@/lib/jisho';
import { VocabWord } from '@/lib/indexeddb';
import { cn } from '@/lib/utils';

interface WordCardProps {
  word: JishoWord;
  isSaved?: boolean;
  onSave?: (word: VocabWord) => void;
  onRemove?: (id: string) => void;
  onClose?: () => void;
}

export function WordCard({ word, isSaved = false, onSave, onRemove, onClose }: WordCardProps) {
  const japanese = word.japanese[0];
  const displayWord = japanese?.word || '';
  const displayReading = japanese?.reading || '';
  const senses = word.senses[0];
  const definitions = senses?.english_definitions || [];
  const partsOfSpeech = senses?.parts_of_speech || [];

  const handleSave = () => {
    const vocabWord: VocabWord = {
      id: word.slug,
      word: displayWord,
      reading: displayReading,
      meaning: definitions,
      addedAt: Date.now(),
    };
    onSave?.(vocabWord);
  };

  const handleRemove = () => {
    onRemove?.(word.slug);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 max-w-lg w-full mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          {displayWord && (
            <h2 className="text-xl font-bold text-neutral-100">{displayWord}</h2>
          )}
          {displayReading && (
            <p className="text-sm text-neutral-400">{displayReading}</p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        {word.is_common && (
          <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-300 rounded">
            常用
          </span>
        )}
        {word.jlpt.length > 0 && (
          <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded">
            {word.jlpt[0]}
          </span>
        )}
        {partsOfSpeech.slice(0, 2).map((pos, i) => (
          <span key={i} className="text-xs px-2 py-0.5 bg-neutral-700 text-neutral-300 rounded">
            {pos}
          </span>
        ))}
      </div>

      {/* Definitions */}
      <div className="mb-4">
        <ul className="space-y-1">
          {definitions.slice(0, 5).map((def, i) => (
            <li key={i} className="text-sm text-neutral-200">
              {i + 1}. {def}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {isSaved ? (
          <Button
            onClick={handleRemove}
            variant="outline"
            size="sm"
            className={cn(
              'flex-1 h-11',
              'border-red-600 text-red-400 hover:bg-red-900/30'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            已收藏
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            variant="outline"
            size="sm"
            className={cn(
              'flex-1 h-11',
              'border-neutral-600 text-neutral-200 hover:bg-neutral-800'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            收藏
          </Button>
        )}
      </div>
    </div>
  );
}
