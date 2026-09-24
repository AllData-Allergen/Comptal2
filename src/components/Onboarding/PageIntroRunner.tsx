import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { SettingsService } from '../../services/SettingsService';
import { pageIntroForPath } from './pageIntros';

const PageIntroRunner: React.FC = () => {
  const location = useLocation();
  const { tourActive, openPageIntro, pageIntro } = useOnboarding();
  const lastAutoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SettingsService.current.scopeAcknowledged) return;
    if (tourActive || pageIntro) return;
    const intro = pageIntroForPath(location.pathname);
    if (!intro) {
      lastAutoRef.current = null;
      return;
    }
    if (lastAutoRef.current === intro.route) return;
    const seen = SettingsService.current.onboarding?.seenPageIntros ?? [];
    if (seen.includes(intro.route)) return;
    lastAutoRef.current = intro.route;
    openPageIntro(intro.route);
  }, [location.pathname, openPageIntro, pageIntro, tourActive]);

  return null;
};

export default PageIntroRunner;
