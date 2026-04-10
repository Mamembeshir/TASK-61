/**
 * useBreakpoint — viewport-aware breakpoint hook.
 *
 * Provides reactive `isMobile` / `isTablet` / `isDesktop` flags so layout
 * components can swap chrome (sticky sidebar vs. drawer + top bar) without
 * relying on CSS-only solutions, which would otherwise leave React-rendered
 * desktop chrome mounted on mobile.
 *
 * Breakpoints (kept aligned with the CSS rules in `styles/global.css`):
 *   mobile  : ≤ 767px
 *   tablet  : 768 – 1023px
 *   desktop : ≥ 1024px
 *
 * `isCompact` is the convenience flag layout code uses — it is true for
 * anything that is not desktop, i.e. when the drawer chrome should appear.
 *
 * Resize handling is debounced via `requestAnimationFrame` so rapid resize
 * events from window dragging don't thrash React renders.
 */
import { useEffect, useState } from "react";

const MOBILE_MAX = 767;
const TABLET_MAX = 1023;

export interface Breakpoint {
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isCompact: boolean;
}

function read(): Breakpoint {
  // SSR / non-browser fallback — assume desktop so the server-rendered tree
  // matches the most common case and we don't flash a mobile chrome on hydration.
  if (typeof window === "undefined") {
    return { width: 1280, isMobile: false, isTablet: false, isDesktop: true, isCompact: false };
  }
  const width = window.innerWidth;
  const isMobile = width <= MOBILE_MAX;
  const isTablet = !isMobile && width <= TABLET_MAX;
  const isDesktop = !isMobile && !isTablet;
  return { width, isMobile, isTablet, isDesktop, isCompact: !isDesktop };
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(read);

  useEffect(() => {
    let raf = 0;
    function onResize() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBp(read()));
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return bp;
}
