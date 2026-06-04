import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'text-white shadow-[0_10px_30px_-8px_hsl(var(--indigo)/0.7),inset_0_1px_0_rgba(255,255,255,0.25)] bg-gradient-to-b from-[hsl(var(--indigo-bright))] to-[hsl(var(--indigo))] hover:-translate-y-0.5',
        destructive:
          'bg-[hsl(var(--rose))] text-white hover:bg-[hsl(var(--rose)/0.9)]',
        outline:
          'shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] bg-[hsl(var(--text-dim)/0.06)] text-foreground hover:bg-[hsl(var(--text-dim)/0.12)] hover:-translate-y-0.5',
        secondary:
          'bg-[hsl(var(--text-dim)/0.06)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-[hsl(var(--text-dim)/0.12)]',
        ghost: 'hover:bg-[hsl(var(--text-dim)/0.08)] text-[hsl(var(--text))]',
        link: 'text-[hsl(var(--indigo-bright))] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-lg px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
