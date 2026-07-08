import { BookOpen } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
import { KARPATHY_WIKI_TAGLINE } from '@shared/constants';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  return (
    <div className="login-bg flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <BookOpen className="size-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">LLM-Wiki</h1>
            <p className="text-sm text-muted-foreground">{KARPATHY_WIKI_TAGLINE}</p>
          </div>
        </div>
        <LoginForm onLoginSuccess={onLoginSuccess} />
      </div>
    </div>
  );
}
