import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = {
  default: 'bg-primary/10 text-primary border-primary/20',
  secondary: 'bg-secondary text-secondary-foreground border-secondary/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  outline: 'text-foreground border-input',
  success: 'bg-green-500/10 text-green-600 border-green-500/20',
  warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

export interface BadgeProps {
  variant?: keyof typeof badgeVariants;
  className?: string;
  children?: React.ReactNode;
}

function Badge({ className, variant = 'default', children }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        badgeVariants[variant],
        className
      )}
    >
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
