import { Button } from '@/components/ui/button';
import type { ComponentProps, ReactNode } from 'react';

export interface PrimaryActionButtonProps extends Omit<ComponentProps<typeof Button>, 'variant' | 'size'> {
  children: ReactNode;
}

export function PrimaryActionButton({ children, className = '', ...props }: PrimaryActionButtonProps) {
  return (
    <Button
      size="sm"
      className={`ix-primary-action-btn ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
}
