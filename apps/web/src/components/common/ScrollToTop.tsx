import React, { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop ensures that navigating to any new page in the application
 * always resets the scroll position to the top of the viewport (y: 0),
 * preventing the user from landing on a new page already scrolled down.
 * If an anchor hash exists (e.g., #terms), it smoothly scrolls to that element.
 */
export const ScrollToTop: React.FC = () => {
  const { pathname, hash, key } = useLocation();

  useLayoutEffect(() => {
    // Disable automatic browser scroll restoration so React Router transitions start at the top
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    if (hash) {
      const elementId = hash.replace('#', '');
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      // If element is not yet in DOM, retry after a short delay
      const timer = setTimeout(() => {
        const el = document.getElementById(elementId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 60);
      return () => clearTimeout(timer);
    }

    // Immediately reset all window and document scroll containers to the top
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.scrollTop = 0;
    }

    const appMain = document.querySelector('.app-main');
    if (appMain) {
      appMain.scrollTop = 0;
    }
  }, [pathname, hash, key]);

  return null;
};
