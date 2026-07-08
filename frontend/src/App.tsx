import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { LLMWikiPage } from '@/pages/LLMWiki';
import { ChatPage } from '@/pages/Chat';
import { LoginPage } from '@/pages/Login';
import { SettingsPage } from '@/pages/Settings';
import { AccountManagementTab } from '@/components/settings/AccountManagementTab';
import { PAGES, type PageId, type LLMWikiTab } from '@shared/constants';
import { AUTH_EXPIRED_EVENT, isLoggedInLocally, getStoredPermissions, clearAuthSession } from '@/services/authSession';
import { refreshWikiIndex } from '@/services/wikiApi';
import { ChatHeaderExtrasProvider } from '@/contexts/ChatHeaderExtras';
import { Sheet, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { fetchCurrentUser } from '@/services/users';
import type { UserPermissions } from '@shared/types';

/** Determine the best default page based on user permissions. */
function getDefaultPage(perms: UserPermissions | null): PageId {
  if (!perms) return PAGES.LLM_WIKI;
  if (perms.can_access_chat) return PAGES.CHAT;
  if (perms.can_access_wiki_workbench || perms.can_access_wiki_rawfiles ||
      perms.can_access_wiki_graph || perms.can_access_wiki_search) {
    return PAGES.LLM_WIKI;
  }
  return PAGES.SETTINGS;
}

function useIsMobile() {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => { const m = window.matchMedia('(max-width: 1023px)'); const h = (e: MediaQueryListEvent) => setV(e.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return v;
}

export default function App() {
  const isMobile = useIsMobile();
  const [isLoggedIn, setIsLoggedIn] = useState(() => isLoggedInLocally());
  const [currentPage, setCurrentPage] = useState<PageId>(() => {
    const perms = getStoredPermissions() as UserPermissions | null;
    return getDefaultPage(perms);
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [llmWikiTab, setLlmWikiTab] = useState<LLMWikiTab>('workbench');
  const [refreshKey, setRefreshKey] = useState(0);
  const [graphFocusPath, setGraphFocusPath] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [chatNewSessionTrigger, setChatNewSessionTrigger] = useState(0);
  const [permissions, setPermissions] = useState<UserPermissions | null>(
    () => getStoredPermissions() as UserPermissions | null
  );

  const handleLoginSuccess = useCallback(() => {
    setIsLoggedIn(true);
    setAuthNotice(null);
    // 登录后重新拉取权限（确保与后端同步）
    void fetchCurrentUser().then((user) => {
      if (user?.permissions) {
        setPermissions(user.permissions);
        setCurrentPage(getDefaultPage(user.permissions));
      } else {
        setCurrentPage(getDefaultPage(null));
      }
    });
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    setIsLoggedIn(false);
    setCurrentPage(PAGES.LLM_WIKI);
    setAuthNotice(null);
    setPermissions(null);
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
    <ChatHeaderExtrasProvider>
    <div className="app-shell flex h-full w-full max-w-full min-w-0 overflow-hidden">
      {/* Desktop sidebar — only rendered on desktop */}
      {!isMobile && (
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
          <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} permissions={permissions} onLogout={handleLogout} />
        </div>
      )}

      {/* Mobile navigation Sheet */}
      <Sheet open={isMobile && mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetHeader>
          <SheetTitle>导航</SheetTitle>
          <SheetClose onClose={() => setMobileMenuOpen(false)} />
        </SheetHeader>
        <Sidebar currentPage={currentPage} onPageChange={(p) => { setCurrentPage(p); setMobileMenuOpen(false); }} permissions={permissions} onLogout={handleLogout} />
      </Sheet>

      <div className="app-main flex-1 flex flex-col min-w-0 mx-0 my-1.5 lg:m-3 rounded-xl border border-border bg-card overflow-hidden">
        <SiteHeader
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => isMobile ? setMobileMenuOpen(true) : setSidebarCollapsed((v) => !v)}
          currentPage={currentPage}
          llmWikiTab={llmWikiTab}
          onLlmWikiTabChange={setLlmWikiTab}
          onRefresh={() => void handleRefresh()}
          onNewChat={() => setChatNewSessionTrigger((k) => k + 1)}
          isMobile={isMobile}
        />

        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
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
            <SettingsPage />
          )}
          {currentPage === PAGES.ACCOUNT_MANAGEMENT && (
            <AccountManagementTab />
          )}
        </main>
      </div>

    </div>
    </ChatHeaderExtrasProvider>
  );
}
