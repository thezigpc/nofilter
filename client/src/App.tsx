import { useEffect, useRef } from "react";
import { Route, Routes } from "react-router-dom";
import { VenueAnnouncement } from "@bargames/gamekit/client";
import HomePage from "./pages/HomePage.js";
import RoomPage from "./pages/RoomPage.js";
import TemplateEditorPage from "./pages/TemplateEditorPage.js";
import TemplateEditorPreviewPage from "./pages/TemplateEditorPreviewPage.js";
import CustomCardsPage from "./pages/CustomCardsPage.js";
import AdminPage from "./pages/AdminPage.js";
import { fetchGameName } from "./publicConfig.js";
import { useVenueBranding, useVenueContext } from "./useVenue.js";

export default function App() {
  // Bar Games venue colours/name - does nothing standalone (see useVenue.ts).
  useVenueBranding();
  const venue = useVenueContext();
  // The staff announcement strip. Staff choose where it shows (everywhere,
  // phones or TVs) and it hides itself where it doesn't belong: a page
  // marked as a shared screen (useIsSharedScreen in useVenue.ts) counts as
  // a TV. Rendered here, at the root, so the Shared Screen gets it too.
  //
  // Staff can also pin it to the bottom, where the scoreboard and the
  // Submit bar live. Its height goes into --venue-announcement-bottom, which
  // lifts both bars (index.css) so it never covers them: nobody can dismiss
  // an announcement on a TV. 0px when it is at the top, hidden, dismissed,
  // or there is none.
  const announcementSlot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slot = announcementSlot.current;
    if (!slot) return;
    const root = document.documentElement;
    let watched: Element | null = null;
    const sizes = new ResizeObserver(() => measure());
    function measure() {
      const el = slot!.querySelector<HTMLElement>('.bargames-announcement[data-position="bottom"]');
      if (el !== watched) {
        sizes.disconnect();
        if (el) sizes.observe(el);
        watched = el;
      }
      // offsetHeight is 0 while the strip is display:none for this screen.
      root.style.setProperty("--venue-announcement-bottom", `${el?.offsetHeight ?? 0}px`);
    }
    const changes = new MutationObserver(measure);
    changes.observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-position", "data-show"] });
    // Marking the page as a shared screen can show or hide the strip.
    changes.observe(root, { attributes: true, attributeFilter: ["data-bargames-screen"] });
    measure();
    return () => {
      changes.disconnect();
      sizes.disconnect();
      root.style.setProperty("--venue-announcement-bottom", "0px");
    };
  }, []);

  // Runs once regardless of route - the tab title isn't page-specific.
  // index.html's <title> is just the pre-JS fallback for the instant
  // before this resolves.
  useEffect(() => {
    fetchGameName().then((name) => {
      document.title = name;
    });
  }, []);

  return (
    <>
      <div ref={announcementSlot} style={{ display: "contents" }}>
        <VenueAnnouncement ctx={venue} />
      </div>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="/editor" element={<TemplateEditorPage />} />
        <Route path="/editor/preview" element={<TemplateEditorPreviewPage />} />
        <Route path="/custom-cards" element={<CustomCardsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </>
  );
}
