import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VocabButtonProps {
  onClick: () => void;
  isSelecting?: boolean;
  className?: string;
}

export function VocabButton({ onClick, isSelecting = false, className }: VocabButtonProps) {
  return (
    <Button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'fixed z-40 rounded-full w-14 h-14 shadow-lg',
        'bg-neutral-800 hover:bg-neutral-700 text-neutral-100',
        'border border-neutral-600',
        'transition-all duration-200',
        'flex items-center justify-center',
        isSelecting
          ? 'bg-red-900/80 hover:bg-red-800/80 border-red-600'
          : '',
        className
      )}
      style={{
        bottom: '5rem',
        right: '1rem',
      }}
    >
      {isSelecting ? (
        <span className="text-sm font-medium">取消</span>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
          <path d="M11 8v6" />
          <path d="M8 11h6" />
        </svg>
      )}
    </Button>
  );
}
