import { useEffect } from "react";
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
  // The staff announcement strip is for phones. It hides itself on any page
  // marked as a shared screen (see useIsSharedScreen in useVenue.ts).

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
      <VenueAnnouncement ctx={venue} />
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
