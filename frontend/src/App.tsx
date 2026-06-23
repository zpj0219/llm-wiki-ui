import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { LLMWikiPage } from '@/pages/LLMWiki';
import { ChatPage } from '@/pages/Chat';
import { LoginPage } from '@/pages/Login';
import { SettingsPage } from '@/pages/Settings';
import { PAGES, type PageId, type LLMWikiTab } from '@shared/constants';
import { AUTH_EXPIRED_EVENT, isLoggedInLocally } from '@/services/authSession';
import { refreshWikiIndex } from '@/services/wikiApi';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => isLoggedInLocally());
  const [currentPage, setCurrentPage] = useState<PageId>(PAGES.LLM_WIKI);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [llmWikiTab, setLlmWikiTab] = useState<LLMWikiTab>('workbench');
  const [refreshKey, setRefreshKey] = useState(0);
  const [graphFocusPath, setGraphFocusPath] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [chatNewSessionTrigger, setChatNewSessionTrigger] = useState(0);

  const handleLoginSuccess = useCallback(() => {
    setIsLoggedIn(true);
    setAuthNotice(null);
    setCurrentPage(PAGES.LLM_WIKI);
  }, []);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setCurrentPage(PAGES.LLM_WIKI);
    setAuthNotice(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshWikiIndex().catch(() => undefined);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const onAuthExpired = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setIsLoggedIn(false);
      setAuthNotice(detail?.message ?? '登录已失效，请重新登录');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, []);

  useEffect(() => {
    const onFocusGraph = (e: Event) => {
      const rel = (e as CustomEvent<string>).detail;
      if (typeof rel === 'string' && rel) setGraphFocusPath(rel);
    };
    window.addEventListener('llm-wiki:graph-focus', onFocusGraph);
    return () => window.removeEventListener('llm-wiki:graph-focus', onFocusGraph);
  }, []);

  if (!isLoggedIn) {
    return (
      <>
        {authNotice && (
          <div className="fixed top-0 left-0 right-0 z-50 border-b border-destructive/30 bg-destructive/5 text-destructive text-sm text-center py-2 px-4">
            {authNotice}
          </div>
        )}
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  return (
    <div className="app-shell flex h-full overflow-hidden">
      <div
        className="h-full shrink-0 transition-[max-width,width,min-width,opacity,transform] duration-250 ease-in-out will-change-[transform,width]"
        style={{
          width: sidebarCollapsed ? '0px' : 'var(--sidebar-width)',
          minWidth: sidebarCollapsed ? '0px' : 'var(--sidebar-width)',
          maxWidth: sidebarCollapsed ? '0px' : 'var(--sidebar-width)',
          overflow: 'hidden',
          opacity: sidebarCollapsed ? 0 : 1,
          pointerEvents: sidebarCollapsed ? 'none' : 'auto',
          transform: sidebarCollapsed ? 'translateX(-12px)' : 'translateX(0)',
        }}
      >
        <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      </div>

      <div className="app-main flex-1 flex flex-col min-w-0 m-3 rounded-xl border border-border bg-card overflow-hidden">
        <SiteHeader
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          currentPage={currentPage}
          llmWikiTab={llmWikiTab}
          onLlmWikiTabChange={setLlmWikiTab}
          onRefresh={() => void handleRefresh()}
          onNewChat={() => setChatNewSessionTrigger((k) => k + 1)}
        />

        <main className="flex-1 min-h-0 overflow-hidden">
          {currentPage === PAGES.LLM_WIKI && (
            <LLMWikiPage
              activeTab={llmWikiTab}
              refreshKey={refreshKey}
              graphFocusPath={graphFocusPath}
              onActiveTabChange={setLlmWikiTab}
            />
          )}
          {currentPage === PAGES.CHAT && (
            <ChatPage newSessionTrigger={chatNewSessionTrigger} />
          )}
          {currentPage === PAGES.SETTINGS && (
            <SettingsPage onLogout={handleLogout} />
          )}
        </main>
      </div>
    </div>
  );
}
