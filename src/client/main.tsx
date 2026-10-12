import '@fontsource-variable/bricolage-grotesque'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toasts'
import { AuthProvider } from './lib/auth'
import { GroupPage } from './pages/GroupPage'
import { GroupsPage } from './pages/GroupsPage'
import { Home } from './pages/Home'
import { JoinGroupPage } from './pages/JoinGroupPage'
import { RoomPage } from './pages/RoomPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/r/:code" element={<RoomPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/groups/:id" element={<GroupPage />} />
              <Route path="/g/:code" element={<JoinGroupPage />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
