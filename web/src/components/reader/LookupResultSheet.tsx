import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uniqueLookupQueries } from '@/lib/segmentJapanese';
import {
  searchJisho,
  searchMazii,
  jishoWebSearchUrl,
  maziiWebSearchUrl,
  type JishoWord,
  type MaziiEntry,
} from '@/lib/jishoClient';
import type { BubbleAnchorRect, OcrLookupScrollSource } from '@/components/reader/readerAnchors';

const MAX_DICT_QUERIES = 36;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scrollSource: OcrLookupScrollSource | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  /** 包裹漫画页的滚动内容根节点（须 `position: relative`）；用 state 传入以保证首帧可挂载 portal */
  scrollContentEl: HTMLDivElement | null;
  imageRefs: MutableRefObject<(HTMLImageElement | null)[]>;
  ocrPhase: 'idle' | 'loading' | 'done' | 'error';
  ocrText: string;
  ocrError: string | null;
}

/** 气泡矩形相对 `scrollContent` 的坐标（与 absolute 定位一致，滚动时由浏览器同步位移，无需监听 scroll）。 */
function resolveBubbleOffsetInScrollContent(
  source: OcrLookupScrollSource | null,
  images: MutableRefObject<(HTMLImageElement | null)[]>,
  scrollContent: HTMLElement | null,
): BubbleAnchorRect | null {
  if (!source || !scrollContent) return null;
  const img = images.current[source.imageIdx];
  if (!img || !img.isConnected) return null;
  const wr = scrollContent.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  const c = source.cropDisplay;
  return {
    left: Math.round(ir.left - wr.left + c.x),
    top: Math.round(ir.top - wr.top + c.y),
    width: Math.round(c.width),
    height: Math.round(c.height),
  };
}

/** 在滚动内容坐标系内摆放面板，竖直方向夹在「当前视口所见的 content Y 区间」内。 */
function placePanelNearBubbleInContent(
  anchor: BubbleAnchorRect,
  panelW: number,
  panelH: number,
  contentW: number,
  visibleTop: number,
  visibleBottom: number,
): { left: number; top: number } {
  const gap = 10;
  const pad = 8;

  let left = anchor.left + anchor.width + gap;
  let top = anchor.top;

  if (left + panelW > contentW - pad) {
    left = anchor.left - panelW - gap;
  }

  if (left < pad) {
    left = Math.min(
      Math.max(pad, anchor.left + anchor.width / 2 - panelW / 2),
      contentW - panelW - pad,
    );
    top = anchor.top + anchor.height + gap;
  }

  top = Math.min(Math.max(visibleTop + pad, top), visibleBottom - panelH - pad);
  left = Math.min(Math.max(pad, left), contentW - panelW - pad);

  return { left, top };
}

function JishoWordRow({ word: w, linkQuery }: { word: JishoWord; linkQuery: string }) {
  const [expanded, setExpanded] = useState(false);
  const primary = w.japanese?.[0];
  const surface = primary?.word ?? primary?.reading ?? w.slug;
  const reading =
    primary?.word && primary?.reading && primary.reading !== primary.word
      ? primary.reading
      : '';
  const firstDefs = w.senses?.[0]?.english_definitions ?? [];
  const brief = firstDefs.length ? firstDefs.join('；') : '—';

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/80">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-neutral-900/80"
      >
        <span className="shrink-0 text-base font-semibold text-neutral-100">{surface}</span>
        {reading ? (
          <span className="shrink-0 text-sm text-neutral-400">{reading}</span>
        ) : (
          <span className="shrink-0 text-sm text-neutral-600">—</span>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 text-sm leading-snug text-neutral-300',
            expanded ? '' : 'line-clamp-2',
          )}
        >
          {brief}
        </span>
        <span className="shrink-0 text-xs text-sky-400">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="lookup-scrollbar max-h-64 overflow-y-auto border-t border-neutral-800 px-3 py-2">
          {w.jlpt && w.jlpt.length > 0 && (
            <p className="mb-2 text-xs text-neutral-500">
              JLPT:{' '}
              {w.jlpt.map((j) => (typeof j === 'string' ? j : j.level)).filter(Boolean).join(', ')}
            </p>
          )}
          {w.senses?.map((sense, si) => (
            <div
              key={si}
              className="border-t border-neutral-800/80 py-2 first:border-0 first:pt-0"
            >
              {sense.parts_of_speech && sense.parts_of_speech.length > 0 && (
                <p className="mb-1 text-xs text-neutral-500">{sense.parts_of_speech.join(' · ')}</p>
              )}
              <p className="text-sm leading-relaxed text-neutral-200">
                {sense.english_definitions?.join(' · ') ?? '—'}
              </p>
            </div>
          ))}
          <a
            href={jishoWebSearchUrl(linkQuery)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-sky-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Jisho 网页（{linkQuery}）→
          </a>
        </div>
      )}
    </div>
  );
}

function MaziiEntryRow({ entry: e, query }: { entry: MaziiEntry; query: string }) {
  const [expanded, setExpanded] = useState(false);
  const brief = e.gloss.slice(0, 2).join('；') || '—';

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/80">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-neutral-900/80"
      >
        <span className="shrink-0 text-base font-semibold text-neutral-100">{e.word}</span>
        {e.reading ? (
          <span className="shrink-0 text-sm text-neutral-400">{e.reading}</span>
        ) : (
          <span className="shrink-0 text-sm text-neutral-600">—</span>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 text-sm leading-snug text-neutral-300',
            expanded ? '' : 'line-clamp-2',
          )}
        >
          {brief}
        </span>
        <span className="shrink-0 text-xs text-sky-400">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="lookup-scrollbar max-h-48 overflow-y-auto border-t border-neutral-800 px-3 py-2">
          {e.gloss.length > 0 && (
            <ul className="mb-2 list-inside list-disc space-y-1 text-sm text-neutral-200">
              {e.gloss.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          <a
            href={maziiWebSearchUrl(query)}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-sky-400 hover:underline"
            onClick={(ev) => ev.stopPropagation()}
          >
            Mazii 网页（{query}）→
          </a>
        </div>
      )}
    </div>
  );
}

type JishoBlock = { query: string; words: JishoWord[]; error?: string };
type MaziiBlock = { query: string; entries: MaziiEntry[]; error?: string };

export function LookupResultSheet({
  open,
  onOpenChange,
  scrollSource,
  scrollContainerRef,
  scrollContentEl,
  imageRefs,
  ocrPhase,
  ocrText,
  ocrError,
}: Props) {
  const [wide, setWide] = useState(false);
  const [dictTab, setDictTab] = useState<'jisho' | 'mazii'>('jisho');
  const [copyFlash, setCopyFlash] = useState(false);
  const [jishoBlocks, setJishoBlocks] = useState<JishoBlock[]>([]);
  const [maziiBlocks, setMaziiBlocks] = useState<MaziiBlock[]>([]);
  const [floatPos, setFloatPos] = useState({ left: 0, top: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const updateFloatPos = useCallback(() => {
    if (!open || !wide || !panelRef.current) return;
    const el = panelRef.current;
    const pw = el.offsetWidth || 400;
    const ph = el.offsetHeight || 320;
    const host = scrollContentEl;
    const sc = scrollContainerRef.current;
    if (host && sc) {
      const bubble = resolveBubbleOffsetInScrollContent(scrollSource, imageRefs, host);
      if (bubble) {
        const cw = host.clientWidth;
        const st = sc.scrollTop;
        const vb = st + sc.clientHeight;
        setFloatPos(placePanelNearBubbleInContent(bubble, pw, ph, cw, st, vb));
        return;
      }
      const st = sc.scrollTop;
      const vb = st + sc.clientHeight;
      setFloatPos({
        left: Math.max(8, host.clientWidth - pw - 16),
        top: Math.min(Math.max(st + 16, st + 8), vb - ph - 8),
      });
    }
  }, [open, wide, scrollSource, imageRefs, scrollContentEl, scrollContainerRef]);

  useLayoutEffect(() => {
    if (!open || !wide || !panelRef.current) return;
    updateFloatPos();
    const id = requestAnimationFrame(() => updateFloatPos());
    return () => cancelAnimationFrame(id);
  }, [open, wide, scrollSource, ocrPhase, ocrText, dictTab, updateFloatPos]);

  useEffect(() => {
    if (!open || !wide) return;
    const host = scrollContentEl;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateFloatPos());
    ro.observe(host);
    return () => ro.disconnect();
  }, [open, wide, scrollContentEl, updateFloatPos]);

  useEffect(() => {
    if (!open || !wide) return;
    const onResize = () => updateFloatPos();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, wide, updateFloatPos]);

  useEffect(() => {
    if (!open || !wide) return;
    const onDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, wide, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || ocrPhase !== 'done') {
      setJishoBlocks([]);
      setMaziiBlocks([]);
      return;
    }

    const queries = uniqueLookupQueries(ocrText).slice(0, MAX_DICT_QUERIES);
    if (queries.length === 0) {
      setJishoBlocks([]);
      setMaziiBlocks([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const [jResults, mResults] = await Promise.all([
        Promise.all(
          queries.map(async (query) => {
            try {
              const res = await searchJisho(query, { glossLang: 'zh' });
              const words = (res.data ?? []).slice(0, 1);
              return {
                query,
                words,
                error: words.length ? undefined : '查询失败',
              } satisfies JishoBlock;
            } catch {
              return { query, words: [], error: '查询失败' } satisfies JishoBlock;
            }
          }),
        ),
        Promise.all(
          queries.map(async (query) => {
            try {
              const res = await searchMazii(query);
              const entries = (res.entries ?? []).slice(0, 1);
              const err = res.error ?? (entries.length === 0 ? '查询失败' : undefined);
              return { query, entries, error: err } satisfies MaziiBlock;
            } catch {
              return { query, entries: [], error: '查询失败' } satisfies MaziiBlock;
            }
          }),
        ),
      ]);

      if (!cancelled) {
        setJishoBlocks(jResults);
        setMaziiBlocks(mResults);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, ocrPhase, ocrText]);

  useEffect(() => {
    if (!open) {
      setJishoBlocks([]);
      setMaziiBlocks([]);
      setCopyFlash(false);
    }
  }, [open]);

  const copyOcr = useCallback(async () => {
    if (!ocrText) return;
    try {
      await navigator.clipboard.writeText(ocrText);
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 2000);
    } catch {
      /* ignore */
    }
  }, [ocrText]);

  const panel = (
    <div
      className={cn(
        'flex flex-col gap-3 border border-neutral-700 bg-neutral-900 p-4 text-neutral-100 shadow-xl',
        wide
          ? 'h-[min(85vh,36rem)] min-h-0 w-[min(100vw-1rem,32rem)] max-w-lg rounded-xl'
          : 'max-h-[min(85vh,36rem)] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-neutral-100">OCR 查词</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          onClick={() => onOpenChange(false)}
        >
          关闭
        </Button>
      </div>

      {ocrPhase === 'loading' && (
        <p className="text-sm text-neutral-400">正在加载识别引擎并识别…（首次可能较久）</p>
      )}
      {ocrPhase === 'error' && ocrError && (
        <p className="text-sm text-red-400">{ocrError}</p>
      )}
      {ocrPhase === 'done' && (
        <>
          <div>
            <p className="mb-1 text-xs text-neutral-500">识别结果</p>
            <p className="rounded-md bg-neutral-950/80 p-2 text-sm leading-relaxed text-neutral-200">
              {ocrText || '（无文字）'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'mt-2 border-neutral-600 bg-transparent transition-colors',
                copyFlash
                  ? 'border-emerald-600/80 text-emerald-300 hover:bg-emerald-950/40'
                  : 'text-neutral-200 hover:bg-neutral-800',
              )}
              onClick={() => void copyOcr()}
              disabled={!ocrText}
            >
              {copyFlash ? '已复制 ✓' : '复制全文'}
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-neutral-800 pt-2">
            <div className="flex shrink-0 rounded-lg bg-neutral-950 p-0.5">
              <button
                type="button"
                onClick={() => setDictTab('jisho')}
                className={cn(
                  'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                  dictTab === 'jisho'
                    ? 'bg-neutral-800 text-neutral-100 shadow'
                    : 'text-neutral-500 hover:text-neutral-300',
                )}
              >
                Jisho
              </button>
              <button
                type="button"
                onClick={() => setDictTab('mazii')}
                className={cn(
                  'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                  dictTab === 'mazii'
                    ? 'bg-neutral-800 text-neutral-100 shadow'
                    : 'text-neutral-500 hover:text-neutral-300',
                )}
              >
                Mazii
              </button>
            </div>

            {dictTab === 'jisho' && (
              <div className="lookup-scrollbar flex min-h-[200px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
                {jishoBlocks.length === 0 && (
                  <p className="text-sm text-neutral-500">
                    无可查词语（已跳过常见功能词、纯片假名等）。
                  </p>
                )}
                <ul className="flex flex-col gap-3">
                  {jishoBlocks.map((block) => (
                    <li
                      key={block.query}
                      className="border-b border-neutral-800/70 pb-3 last:border-0 last:pb-0"
                    >
                      {block.error || block.words.length === 0 ? (
                        <p className="text-sm text-red-400">{block.error ?? '查询失败'}</p>
                      ) : (
                        <JishoWordRow word={block.words[0]!} linkQuery={block.query} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dictTab === 'mazii' && (
              <div className="lookup-scrollbar flex min-h-[200px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
                {maziiBlocks.length === 0 && (
                  <p className="text-sm text-neutral-500">
                    无可查词语（已跳过常见功能词、纯片假名等）。
                  </p>
                )}
                <ul className="flex flex-col gap-3">
                  {maziiBlocks.map((block) => (
                    <li
                      key={`m-${block.query}`}
                      className="border-b border-neutral-800/70 pb-3 last:border-0 last:pb-0"
                    >
                      {block.error || block.entries.length === 0 ? (
                        <p className="text-sm text-red-400">{block.error ?? '查询失败'}</p>
                      ) : (
                        <MaziiEntryRow entry={block.entries[0]!} query={block.query} />
                      )}
                    </li>
                  ))}
                </ul>
                {maziiBlocks.length > 0 &&
                  maziiBlocks.every((b) => b.error || b.entries.length === 0) && (
                    <p className="text-xs text-neutral-500">
                      Mazii 上游常拦截服务器或境外 IP；若持续失败请用 Jisho。
                    </p>
                  )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (wide) {
    if (!open) return null;
    const host = scrollContentEl;
    if (!host) return null;
    return createPortal(
      <div
        ref={panelRef}
        className="pointer-events-auto absolute z-[60]"
        style={{ left: floatPos.left, top: floatPos.top }}
        role="dialog"
        aria-label="OCR 查词"
      >
        {panel}
      </div>,
      host,
    );
  }

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="关闭"
          onClick={() => onOpenChange(false)}
        />
      )}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 transition-transform duration-200 ease-out md:hidden',
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
      >
        {panel}
      </div>
    </>
  );
}
