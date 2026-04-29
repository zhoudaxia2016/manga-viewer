import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useOcr } from '@/hooks/useOcr';
import { useDictionary } from '@/hooks/useDictionary';
import { useVocabulary } from '@/hooks/useVocabulary';
import { VocabWord } from '@/lib/indexeddb';
import { WordCard } from './WordCard';
import { cn } from '@/lib/utils';

type OcrPopupState = 'initial' | 'recognizing' | 'recognized' | 'result' | 'error';

interface OcrPopupProps {
  imageDataUrl: string;
  onClose: () => void;
}

export function OcrPopup({ imageDataUrl, onClose }: OcrPopupProps) {
  const [state, setState] = useState<OcrPopupState>('initial');
  const [recognizedText, setRecognizedText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const { recognize, progress } = useOcr();
  const { search, result: dictionaryResult, isLoading: isSearching, error: searchError } = useDictionary();
  const { addWord, removeWord, hasWord } = useVocabulary();
  const [isSaved, setIsSaved] = useState(false);

  const handleRecognize = useCallback(async () => {
    setState('recognizing');
    try {
      const text = await recognize(imageDataUrl);
      setRecognizedText(text.trim());
      setState('recognized');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '识别失败');
      setState('error');
    }
  }, [imageDataUrl, recognize]);

  const handleSearch = useCallback(async () => {
    if (!recognizedText) return;
    await search(recognizedText);
    if (!searchError) {
      setState('result');
      // Check if word is already saved
      const saved = await hasWord(dictionaryResult?.slug || recognizedText);
      setIsSaved(saved);
    }
  }, [recognizedText, search, searchError, hasWord, dictionaryResult?.slug]);

  const handleSave = useCallback(async (word: VocabWord) => {
    await addWord(word);
    setIsSaved(true);
  }, [addWord]);

  const handleRemove = useCallback(async (id: string) => {
    await removeWord(id);
    setIsSaved(false);
  }, [removeWord]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Content */}
      <div
        className={cn(
          'relative w-full sm:max-w-lg sm:rounded-xl',
          'bg-neutral-900 border border-neutral-700',
          'max-h-[85vh] overflow-y-auto',
          'animate-in slide-in-from-bottom-4 duration-200'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 p-4 flex items-center justify-between">
          <h3 className="text-neutral-100 font-medium">
            {state === 'initial' && '识别文字'}
            {state === 'recognizing' && '识别中...'}
            {state === 'recognized' && '识别结果'}
            {state === 'result' && '查词结果'}
            {state === 'error' && '错误'}
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Image Preview */}
          {(state === 'initial' || state === 'recognizing') && (
            <div className="space-y-4">
              <img
                src={imageDataUrl}
                alt="Selected region"
                className="w-full rounded-lg border border-neutral-700"
              />
              <Button
                onClick={handleRecognize}
                disabled={state === 'recognizing'}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {state === 'recognizing' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    识别中 {progress}%
                  </span>
                ) : (
                  '识别文字'
                )}
              </Button>
              {state === 'recognizing' && (
                <Progress value={progress} className="h-1 bg-neutral-700 [&>div]:bg-blue-500" />
              )}
            </div>
          )}

          {/* Recognizing progress */}
          {state === 'recognizing' && progress > 0 && (
            <div className="text-center text-sm text-neutral-400">
              正在识别文字... {progress}%
            </div>
          )}

          {/* Recognized text */}
          {state === 'recognized' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-neutral-400 mb-2 block">识别文字</label>
                <textarea
                  value={recognizedText}
                  onChange={(e) => setRecognizedText(e.target.value)}
                  className="w-full h-24 bg-neutral-800 border border-neutral-600 rounded-lg p-3 text-neutral-100 resize-none focus:outline-none focus:border-blue-500"
                  placeholder="请修正识别错误的文字..."
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={!recognizedText || isSearching}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    查询中...
                  </span>
                ) : (
                  '查词'
                )}
              </Button>
            </div>
          )}

          {/* Dictionary result */}
          {state === 'result' && dictionaryResult && (
            <WordCard
              word={dictionaryResult}
              isSaved={isSaved}
              onSave={handleSave}
              onRemove={handleRemove}
              onClose={onClose}
            />
          )}

          {/* No result found */}
          {state === 'result' && !dictionaryResult && (
            <div className="text-center py-8">
              <p className="text-neutral-400 mb-4">未找到词典结果</p>
              <Button
                onClick={() => setState('recognized')}
                variant="outline"
                className="border-neutral-600 text-neutral-200"
              >
                重新编辑
              </Button>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="text-center py-8">
              <p className="text-red-400 mb-4">{errorMessage}</p>
              <Button
                onClick={() => setState('initial')}
                variant="outline"
                className="border-neutral-600 text-neutral-200"
              >
                重试
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
