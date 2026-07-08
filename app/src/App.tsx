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
import { LanguageProvider } from "./context/LanguageContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";
import { CompactModeProvider } from "./context/CompactModeContext";
import { SoundProvider } from "./context/SoundContext";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { tauriApi } from "./api/tauri";

const queryClient = new QueryClient();

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionPinRequired, setSessionPinRequired] = useState(false);
  const [sessionPin, setSessionPin] = useState("");
  const [sessionPinError, setSessionPinError] = useState("");
  const [sessionPinUnlocking, setSessionPinUnlocking] = useState(false);
  const [savedApiId, setSavedApiId] = useState<number | null>(null);
  const { theme } = useTheme();
  const { available, version, downloading, progress, error: updateError, checkForUpdates, downloadAndInstall, dismissUpdate } = useUpdateCheck();

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
          setSavedApiId(apiId);
          if (await tauriApi.isSessionProtected()) {
            setSessionPinRequired(true);
            return;
          }
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

  const unlockProtectedSession = async () => {
    if (savedApiId == null || sessionPin.length !== 6 || sessionPinUnlocking) return;
    setSessionPinUnlocking(true);
    setSessionPinError("");
    try {
      await tauriApi.unlockSessionPin(sessionPin);
      await invoke('cmd_connect', { apiId: savedApiId });
      setSessionPinRequired(false);
      setSessionPin("");
      setIsAuthenticated(true);
    } catch (error) {
      setSessionPin("");
      setSessionPinError(error instanceof Error ? error.message : String(error));
    } finally {
      setSessionPinUnlocking(false);
    }
  };

  if (!sessionChecked) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-5 bg-[#0b1521]">
      <img src="/logo.svg" className="h-14 w-14 animate-pulse" alt="SharkDrive" />
      <div className="w-32 overflow-hidden rounded-full bg-white/[0.06]" style={{ height: 3 }}>
        <div
          className="h-full rounded-full bg-telegram-primary"
          style={{ animation: 'splashProgress 1.4s ease-in-out infinite', width: '40%' }}
        />
      </div>
      <p className="text-xs text-telegram-subtext/60">Connecting...</p>
      <style>{`
        @keyframes splashProgress {
          0%   { transform: translateX(-100%) }
          100% { transform: translateX(350%) }
        }
      `}</style>
    </div>
  );

  if (sessionPinRequired) return (
    <main className="h-screen w-screen bg-[#0b1521] text-telegram-text flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-telegram-border bg-telegram-surface p-6 shadow-2xl">
        <img src="/logo.svg" className="mx-auto mb-5 h-12 w-12" alt="SharkDrive" />
        <h1 className="text-center text-xl font-semibold">Unlock Telegram Session</h1>
        <p className="mt-2 text-center text-sm text-telegram-subtext">Enter your 6-digit SharkDrive PIN to decrypt the saved Telegram session.</p>
        <input
          autoFocus
          inputMode="numeric"
          maxLength={6}
          value={sessionPin}
          onChange={(event) => {
            setSessionPin(event.target.value.replace(/\D/g, '').slice(0, 6));
            setSessionPinError("");
          }}
          onKeyDown={(event) => event.key === 'Enter' && void unlockProtectedSession()}
          className="mt-5 w-full rounded-xl border border-telegram-border bg-black/20 px-4 py-3 text-center text-lg tracking-[0.35em] text-telegram-text outline-none focus:border-telegram-primary"
          placeholder="000000"
        />
        {sessionPinError && (
          <p className="mt-3 text-center text-xs text-red-300">Could not unlock the saved session. Check the PIN and retry.</p>
        )}
        <button
          disabled={sessionPin.length !== 6 || savedApiId == null || sessionPinUnlocking}
          onClick={() => void unlockProtectedSession()}
          className="mt-4 w-full rounded-xl bg-telegram-primary px-4 py-3 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {sessionPinUnlocking ? 'Unlocking...' : 'Unlock'}
        </button>
      </div>
    </main>
  );

  return (
    <main className="h-screen w-screen text-telegram-text overflow-hidden selection:bg-telegram-primary/30 relative">
      <UpdateBanner
        available={available}
        version={version}
        downloading={downloading}
        progress={progress}
        error={updateError}
        onRetry={checkForUpdates}
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
      <LanguageProvider>
        <ThemeProvider>
          <CompactModeProvider>
            <SoundProvider>
              <QueryClientProvider client={queryClient}>
                <ConfirmProvider>
                  <DropZoneProvider>
                    <AppContent />
                  </DropZoneProvider>
                </ConfirmProvider>
              </QueryClientProvider>
            </SoundProvider>
          </CompactModeProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
