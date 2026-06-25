import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type ChatHeaderExtrasContextValue = {
  extras: ReactNode;
  setExtras: (node: ReactNode) => void;
};

const ChatHeaderExtrasContext = createContext<ChatHeaderExtrasContextValue | null>(null);

export function ChatHeaderExtrasProvider({ children }: { children: ReactNode }) {
  const [extras, setExtras] = useState<ReactNode>(null);
  const value = useMemo(() => ({ extras, setExtras }), [extras]);
  return (
    <ChatHeaderExtrasContext.Provider value={value}>{children}</ChatHeaderExtrasContext.Provider>
  );
}

export function useChatHeaderExtras() {
  const ctx = useContext(ChatHeaderExtrasContext);
  if (!ctx) {
    throw new Error('useChatHeaderExtras must be used within ChatHeaderExtrasProvider');
  }
  return ctx;
}

export function useChatHeaderExtrasSlot() {
  return useContext(ChatHeaderExtrasContext)?.extras ?? null;
}
