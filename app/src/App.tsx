import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthWizard } from "./components/AuthWizard";
import { Dashboard } from "./components/Dashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateBanner } from "./components/UpdateBanner";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import "./App.css";

import { Toaster } from "sonner";
import { ConfirmProvider } from "./context/ConfirmContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

const queryClient = new QueryClient();

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const { theme } = useTheme();
  const { available, version, downloading, progress, downloadAndInstall, dismissUpdate } = useUpdateCheck();

  useEffect(() => {
    const tryAutoLogin = async () => {
      try {
        let store = await Store.load('config.json');
        let apiIdStr = await store.get<string>('api_id');
        if (!apiIdStr) {
          store = await Store.load('settings.json');
          apiIdStr = await store.get<string>('api_id');
        }
        if (apiIdStr) {
          const apiId = parseInt(apiIdStr);
          await invoke('cmd_connect', { apiId });
          setIsAuthenticated(true);
        }
      } catch {
        // session invalid or no credentials, show AuthWizard
      } finally {
        setSessionChecked(true);
      }
    };
    tryAutoLogin();
  }, []);

  if (!sessionChecked) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-5 bg-[#0b1521]">
      <img src="/logo.svg" className="h-14 w-14 animate-pulse" alt="SharkDrive" />
      <div className="w-32 overflow-hidden rounded-full bg-white/[0.06]" style={{ height: 3 }}>
        <div
          className="h-full rounded-full bg-telegram-primary"
          style={{ animation: 'splashProgress 1.4s ease-in-out infinite', width: '40%' }}
        />
      </div>
      <p className="text-xs text-telegram-subtext/60">Connecting…</p>
      <style>{`
        @keyframes splashProgress {
          0%   { transform: translateX(-100%) }
          100% { transform: translateX(350%) }
        }
      `}</style>
    </div>
  );

  return (
    <main className="h-screen w-screen text-telegram-text overflow-hidden selection:bg-telegram-primary/30 relative">
      <UpdateBanner
        available={available}
        version={version}
        downloading={downloading}
        progress={progress}
        onUpdate={downloadAndInstall}
        onDismiss={dismissUpdate}
      />
      <Toaster theme={theme} position="bottom-center" />
      {isAuthenticated ? (
        <Dashboard onLogout={() => setIsAuthenticated(false)} />
      ) : (
        <AuthWizard onLogin={() => setIsAuthenticated(true)} />
      )}
    </main>
  );
}


function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ConfirmProvider>
            <DropZoneProvider>
              <AppContent />
            </DropZoneProvider>
          </ConfirmProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
