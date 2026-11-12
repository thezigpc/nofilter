// Venue branding for the React client (Bar Games).
//
// Off a box this never changes anything: watchVenue() doesn't fire for a
// standalone game and applyTheme() ignores standalone contexts, so every
// --venue-* CSS variable stays unset and index.css's fallbacks apply.

import { applyTheme, getVenue, isOnBox, markSharedScreen, tableMode, watchVenue, type VenueContext } from "@bargames/sdk/client";
import { useEffect, useRef, useState } from "react";
import { serverOriginUrl } from "./socket.js";

let current: VenueContext | null = null;
const listeners = new Set<(ctx: VenueContext) => void>();

/** Keeps the venue theme applied. Call once, at the app root. */
export function useVenueBranding(): void {
  useEffect(
    () =>
      watchVenue(
        (ctx) => {
          current = ctx;
          applyTheme(ctx); // sets --venue-* on <html>
          for (const fn of listeners) fn(ctx);
        },
        // The client runs on Vite's own port in dev. 30 s, so a staff
        // announcement typed on the box shows up quickly.
        { base: serverOriginUrl || undefined, intervalMs: 30_000 }
      ),
    []
  );
}

/**
 * The live venue context, for the kit's <BackToGames /> and
 * <VenueAnnouncement />. Stays null standalone, where both render nothing.
 */
export function useVenueContext(): VenueContext | null {
  const [ctx, setCtx] = useState(current);
  useEffect(() => {
    setCtx(current);
    listeners.add(setCtx);
    return () => {
      listeners.delete(setCtx);
    };
  }, []);
  return ctx;
}

/**
 * Marks the page as a shared screen while `isShared` is true, so the staff
 * announcement strip hides itself (the box puts announcements on its TVs
 * itself). tableMode() does this for a cast TV; this covers every other
 * Table - "Set up the Shared Screen" lands on a plain /room/CODE - and the
 * Template Editor's preview frame.
 */
export function useIsSharedScreen(isShared: boolean): void {
  useEffect(() => (isShared ? markSharedScreen() : undefined), [isShared]);
}

/** True only on a Bar Games box (never standalone). */
export function useOnBox(): boolean {
  const [onBox, setOnBox] = useState(isOnBox(current));
  useEffect(() => {
    const fn = (ctx: VenueContext) => setOnBox(isOnBox(ctx));
    setOnBox(isOnBox(current)); // the venue may have arrived between render and here
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return onBox;
}

/**
 * The cast-TV view's chrome: on a box, hides the pointer, keeps the screen
 * awake, sets --bg-safe-x/--bg-safe-y and shows the SDK's standard
 * "Reconnecting..." strip and "Room closed" screen. Off a box it does
 * nothing at all. The game's own reconnect logic stays in charge - this only
 * shows its state.
 */
export function useTableDisplay(enabled: boolean, connected: boolean, closed: boolean): void {
  const tm = useRef<ReturnType<typeof tableMode> | null>(null);
  const latest = useRef({ connected, closed });
  latest.current = { connected, closed };

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    void getVenue({ base: serverOriginUrl || undefined }).then((ctx) => {
      if (stopped) return;
      tm.current = tableMode(ctx);
      const { connected: c, closed: x } = latest.current;
      tm.current.setState(x ? "closed" : c ? "connected" : "reconnecting");
    });
    return () => {
      stopped = true;
      tm.current?.stop();
      tm.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    tm.current?.setState(closed ? "closed" : connected ? "connected" : "reconnecting");
  }, [connected, closed]);
}
