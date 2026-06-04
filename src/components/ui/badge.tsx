import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider mono',
  {
    variants: {
      variant: {
        default:
          'bg-[hsl(var(--indigo)/0.12)] text-[hsl(var(--indigo-bright))] shadow-[inset_0_0_0_1px_hsl(var(--indigo)/0.28)]',
        secondary:
          'bg-[hsl(var(--text-dim)/0.08)] text-[hsl(var(--text))] shadow-[inset_0_0_0_1px_hsl(var(--line))]',
        destructive:
          'bg-[hsl(var(--rose)/0.14)] text-[hsl(var(--rose))] shadow-[inset_0_0_0_1px_hsl(var(--rose)/0.35)]',
        success:
          'bg-[hsl(var(--mint)/0.14)] text-[hsl(var(--mint))] shadow-[inset_0_0_0_1px_hsl(var(--mint)/0.35)]',
        warning:
          'bg-[hsl(var(--amber)/0.14)] text-[hsl(var(--amber))] shadow-[inset_0_0_0_1px_hsl(var(--amber)/0.35)]',
        outline: 'text-foreground shadow-[inset_0_0_0_1px_hsl(var(--line))]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
