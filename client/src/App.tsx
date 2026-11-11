import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { VenueAnnouncement } from "@bargames/gamekit/client";
import HomePage from "./pages/HomePage.js";
import RoomPage from "./pages/RoomPage.js";
import TemplateEditorPage from "./pages/TemplateEditorPage.js";
import TemplateEditorPreviewPage from "./pages/TemplateEditorPreviewPage.js";
import CustomCardsPage from "./pages/CustomCardsPage.js";
import AdminPage from "./pages/AdminPage.js";
import { fetchGameName } from "./publicConfig.js";
import { useSharedScreenActive, useVenueBranding, useVenueContext } from "./useVenue.js";

export default function App() {
  // Bar Games venue colours/name - does nothing standalone (see useVenue.ts).
  useVenueBranding();
  const venue = useVenueContext();
  // The staff announcement strip is for phones. Shared screens (any Table,
  // cast TVs included, and the Template Editor's preview frame) never show
  // it: the box puts announcements on its TVs itself.
  // The URL catches a Table before it has joined; the room page reports
  // the rest (useIsSharedScreen), since a Table's URL can be a plain /room/CODE.
  const { pathname, search } = useLocation();
  const joinedAsTable = useSharedScreenActive();
  const sharedScreen =
    joinedAsTable || new URLSearchParams(search).get("role") === "table" || pathname === "/editor/preview";

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
      {!sharedScreen && <VenueAnnouncement ctx={venue} />}
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
