import { cn } from '@/lib/utils';

const ADMIN_AVATAR = '/avatars.png';
const USER_AVATAR = '/user.png';

type UserAvatarProps = {
  username: string;
  isAdmin: boolean;
  className?: string;
  fallbackClassName?: string;
};

export function UserAvatar({
  username,
  isAdmin,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const initial = username.charAt(0).toUpperCase() || 'U';

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-full bg-muted', className ?? 'size-8')}
    >
      <img
        src={isAdmin ? ADMIN_AVATAR : USER_AVATAR}
        alt={username}
        className="h-full w-full object-cover"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (!parent || parent.dataset.fallbackApplied) return;
          parent.dataset.fallbackApplied = '1';
          const fallback = document.createElement('span');
          fallback.className = cn(
            'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-500 font-semibold text-white',
            fallbackClassName ?? 'text-xs'
          );
          fallback.textContent = initial;
          parent.appendChild(fallback);
        }}
      />
    </div>
  );
}
