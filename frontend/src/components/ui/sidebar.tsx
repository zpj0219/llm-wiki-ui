import * as React from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';

type SidebarTriggerProps = ButtonProps & {
  collapsed?: boolean;
  onToggle?: () => void;
};

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, SidebarTriggerProps>(
  ({ collapsed = false, onToggle, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8 shrink-0', className)}
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={(event) => {
          onToggle?.();
          props.onClick?.(event);
        }}
        {...props}
      >
        {collapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </Button>
    );
  }
);
SidebarTrigger.displayName = 'SidebarTrigger';
