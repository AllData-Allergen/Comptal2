import React, { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MainLayout from './components/Layout/MainLayout';
import Parametre from './pages/Parametre/Parametre';
import Dashboard from './pages/Dashboard/Dashboard';
import Upload from './pages/Upload/Upload';
import Edition from './pages/Edition/Edition';
import FinanceGlobal from './pages/FinanceGlobal/FinanceGlobal';
import { SettingsService } from './services/SettingsService';
import { MenuVisibility } from './types/settings';
import { useTheme } from './hooks/useTheme';
import { OnboardingProvider } from './contexts/OnboardingContext';
import TourOverlay from './components/Onboarding/TourOverlay';
import OnboardingLauncher from './components/Onboarding/OnboardingLauncher';
import PageIntroRunner from './components/Onboarding/PageIntroRunner';
import ScopeDisclaimerModal from './components/Common/ScopeDisclaimerModal';

const Previsionnel = lazy(() => import('./pages/Previsionnel/Previsionnel'));
const Facturation = lazy(() => import('./pages/Facturation/Facturation'));
const ClientPage = lazy(() => import('./pages/Client/Client'));
const Association = lazy(() => import('./pages/Association/Association'));
const Register = lazy(() => import('./pages/Register/Register'));
const Amortissement = lazy(() => import('./pages/Amortissement/Amortissement'));

const MenuVisibleRoute: React.FC<{ page: keyof MenuVisibility; children: React.ReactNode }> = ({
  page,
  children,
}) => {
  const [visible, setVisible] = useState(() => SettingsService.current.menuVisibility[page]);
  useEffect(
    () => SettingsService.subscribe((settings) => setVisible(settings.menuVisibility[page])),
    [page]
  );
  if (!visible) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const [profileId, setProfileId] = useState(SettingsService.current.activeProfileId);
  useEffect(
    () => SettingsService.subscribe((settings) => setProfileId(settings.activeProfileId)),
    []
  );

  return (
    <Routes key={profileId ?? 'none'}>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/upload" element={<Upload />} />
      <Route path="/edition" element={<Edition />} />
      <Route path="/finance-global" element={<FinanceGlobal />} />
      <Route path="/previsionnel" element={<Previsionnel />} />
      <Route path="/project-management" element={<Navigate to="/previsionnel" replace />} />
      <Route
        path="/facturation"
        element={
          <MenuVisibleRoute page="invoicing">
            <Facturation />
          </MenuVisibleRoute>
        }
      />
      <Route path="/invoicing" element={<Navigate to="/facturation" replace />} />
      <Route path="/clients" element={<ClientPage />} />
      <Route path="/contacts" element={<Navigate to="/clients" replace />} />
      <Route
        path="/dons"
        element={
          <MenuVisibleRoute page="association">
            <Association />
          </MenuVisibleRoute>
        }
      />
      <Route path="/association" element={<Navigate to="/dons" replace />} />
      <Route
        path="/registre"
        element={
          <MenuVisibleRoute page="register">
            <Register />
          </MenuVisibleRoute>
        }
      />
      <Route
        path="/amortissement"
        element={
          <MenuVisibleRoute page="amortissement">
            <Amortissement />
          </MenuVisibleRoute>
        }
      />
      <Route path="/parametre" element={<Parametre />} />
    </Routes>
  );
};

const App: React.FC = () => {
  const { theme } = useTheme();
  const [scopeOpen, setScopeOpen] = useState(!SettingsService.current.scopeAcknowledged);

  const acknowledgeScope = async () => {
    await SettingsService.save({ scopeAcknowledged: true });
    setScopeOpen(false);
  };

  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <OnboardingProvider>
        <MainLayout>
          <Suspense fallback={<div className="p-6 text-[var(--invoicing-gray-800)]">…</div>}>
            <AppRoutes />
          </Suspense>
        </MainLayout>
        <TourOverlay />
        <OnboardingLauncher />
        <PageIntroRunner />
        <ScopeDisclaimerModal isOpen={scopeOpen} onAcknowledge={() => void acknowledgeScope()} />
        <ToastContainer
          position="bottom-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnFocusLoss={false}
          draggable
          pauseOnHover
          theme={theme === 'dark' ? 'dark' : 'light'}
        />
      </OnboardingProvider>
    </Router>
  );
};

export default App;
