import * as React from 'react';
import { Menu, PanelLeft, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';

type SidebarTriggerProps = ButtonProps & {
  collapsed?: boolean;
  onToggle?: () => void;
  isMobile?: boolean;
};

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, SidebarTriggerProps>(
  ({ collapsed = false, onToggle, className, isMobile, ...props }, ref) => {
    const icon = isMobile ? <Menu className="h-4 w-4" /> : collapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />;
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8 shrink-0', className)}
        aria-label={isMobile ? '菜单' : collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={(event) => {
          onToggle?.();
          props.onClick?.(event);
        }}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);
SidebarTrigger.displayName = 'SidebarTrigger';
