import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PAGE_INTROS, pageIntroForPath } from '../components/Onboarding/pageIntros';
import { TOUR_STEP_COUNT, TOUR_STEPS } from '../components/Onboarding/tourSteps';
import { Logger } from '../services/logger';
import { SettingsService } from '../services/SettingsService';
import { locationMatchesTourRoute, PageIntro, TourStep } from '../types/onboarding';

interface OnboardingContextValue {
  tourActive: boolean;
  tourPaused: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  pageIntro: PageIntro | null;
  tourCompleted: boolean;
  startTour: (index?: number) => void;
  next: () => void;
  previous: () => void;
  skipStep: () => void;
  skipTour: () => void;
  goToStep: (index: number) => void;
  resumeTour: () => void;
  openPageIntro: (route: string) => void;
  dismissPageIntro: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function persistOnboarding(partial: {
  tourCompleted?: boolean;
  seenPageIntros?: string[];
}): void {
  const current = SettingsService.current.onboarding ?? {
    tourCompleted: false,
    seenPageIntros: [],
  };
  SettingsService.save({
    onboarding: {
      tourCompleted: partial.tourCompleted ?? current.tourCompleted,
      seenPageIntros: partial.seenPageIntros ?? current.seenPageIntros,
    },
  }).catch((err) => Logger.error('OnboardingContext.persist', err));
}

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tourActive, setTourActive] = useState(false);
  const [tourPaused, setTourPaused] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [pageIntro, setPageIntro] = useState<PageIntro | null>(null);
  const [tourCompleted, setTourCompleted] = useState(
    () => SettingsService.current.onboarding?.tourCompleted ?? false
  );
  const navigatingRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const initialTourStartedRef = useRef(false);

  const currentStep = tourActive ? (TOUR_STEPS[currentStepIndex] ?? null) : null;

  const navigateToStep = useCallback(
    (index: number) => {
      const step = TOUR_STEPS[index];
      if (!step) return;
      navigatingRef.current = true;
      setCurrentStepIndex(index);
      setTourPaused(false);
      navigate(step.route);
    },
    [navigate]
  );

  const startTour = useCallback(
    (index = 0) => {
      const safe = Math.min(Math.max(index, 0), TOUR_STEP_COUNT - 1);
      setPageIntro(null);
      setTourActive(true);
      navigateToStep(safe);
    },
    [navigateToStep]
  );

  const tryStartInitialTour = useCallback(() => {
    if (initialTourStartedRef.current) return;
    if (!SettingsService.current.scopeAcknowledged) return;
    if (SettingsService.current.onboarding?.tourCompleted ?? false) return;
    initialTourStartedRef.current = true;
    startTour(0);
  }, [startTour]);

  const completeTour = useCallback(() => {
    setTourActive(false);
    setTourPaused(false);
    setTourCompleted(true);
    persistOnboarding({ tourCompleted: true });
  }, []);

  const next = useCallback(() => {
    if (currentStepIndex >= TOUR_STEP_COUNT - 1) {
      completeTour();
      return;
    }
    navigateToStep(currentStepIndex + 1);
  }, [completeTour, currentStepIndex, navigateToStep]);

  const previous = useCallback(() => {
    if (currentStepIndex <= 0) return;
    navigateToStep(currentStepIndex - 1);
  }, [currentStepIndex, navigateToStep]);

  const skipStep = useCallback(() => {
    next();
  }, [next]);

  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= TOUR_STEP_COUNT) return;
      setTourActive(true);
      setPageIntro(null);
      navigateToStep(index);
    },
    [navigateToStep]
  );

  const resumeTour = useCallback(() => {
    if (!tourActive) return;
    navigateToStep(currentStepIndex);
  }, [currentStepIndex, navigateToStep, tourActive]);

  const openPageIntro = useCallback((route: string) => {
    const intro = PAGE_INTROS[route] ?? pageIntroForPath(route);
    if (!intro) return;
    setPageIntro(intro);
  }, []);

  const dismissPageIntro = useCallback(() => {
    if (!pageIntro) return;
    const seen = new Set(SettingsService.current.onboarding?.seenPageIntros ?? []);
    seen.add(pageIntro.route);
    persistOnboarding({ seenPageIntros: Array.from(seen) });
    setPageIntro(null);
  }, [pageIntro]);

  useEffect(() => {
    if (!tourActive || !currentStep) return;
    if (locationMatchesTourRoute(currentStep.route, location.pathname, location.search)) {
      navigatingRef.current = false;
      setTourPaused(false);
      return;
    }
    if (navigatingRef.current) {
      return;
    }
    setTourPaused(true);
  }, [currentStep, location.pathname, location.search, tourActive]);

  useEffect(() => {
    if (pageIntro && location.pathname !== pageIntro.route) {
      setPageIntro(null);
    }
  }, [location.pathname, pageIntro]);

  useEffect(() => {
    return SettingsService.subscribe((settings) => {
      setTourCompleted(settings.onboarding?.tourCompleted ?? false);
      if (settings.scopeAcknowledged) {
        tryStartInitialTour();
      }
    });
  }, [tryStartInitialTour]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    tryStartInitialTour();
  }, [tryStartInitialTour]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      tourActive,
      tourPaused,
      currentStepIndex,
      currentStep,
      pageIntro,
      tourCompleted,
      startTour,
      next,
      previous,
      skipStep,
      skipTour,
      goToStep,
      resumeTour,
      openPageIntro,
      dismissPageIntro,
    }),
    [
      currentStep,
      currentStepIndex,
      dismissPageIntro,
      goToStep,
      next,
      openPageIntro,
      pageIntro,
      previous,
      resumeTour,
      skipStep,
      skipTour,
      startTour,
      tourActive,
      tourCompleted,
      tourPaused,
    ]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}
