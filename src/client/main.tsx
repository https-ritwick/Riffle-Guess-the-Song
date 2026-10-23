import '@fontsource-variable/bricolage-grotesque'
import './styles.css'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProfileGate } from './components/ProfilePrompt'
import { ToastProvider } from './components/Toasts'
import { Spinner } from './components/ui'
import { AuthProvider } from './lib/auth'
import { SiteProvider } from './lib/site'
import { GroupPage } from './pages/GroupPage'
import { GroupsPage } from './pages/GroupsPage'
import { Home } from './pages/Home'
import { JoinGroupPage } from './pages/JoinGroupPage'
import { RoomPage } from './pages/RoomPage'

// Pages most players never open load on demand.
const AdminApp = lazy(() => import('./admin/AdminApp'))
const TermsPage = lazy(() => import('./pages/Legal').then((m) => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('./pages/Legal').then((m) => ({ default: m.PrivacyPage })))

const loading = (
  <div className="min-h-dvh bg-night pt-24">
    <Spinner label="Loading…" />
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <SiteProvider>
              <Suspense fallback={loading}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/r/:code" element={<RoomPage />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/groups/:id" element={<GroupPage />} />
                  <Route path="/g/:code" element={<JoinGroupPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/admin/*" element={<AdminApp />} />
                  <Route path="*" element={<Home />} />
                </Routes>
              </Suspense>
              <ProfileGate />
            </SiteProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
