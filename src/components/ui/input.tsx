import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--text-faint))] shadow-[inset_0_0_0_1px_hsl(var(--line))] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--indigo))] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
