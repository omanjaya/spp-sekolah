import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingSkeletonProps {
  /** Number of skeleton rows to render. Default 4. */
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 4, className }: LoadingSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Memuat">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">Memuat data</span>
    </div>
  );
}
