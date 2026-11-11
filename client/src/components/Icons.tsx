// Minimal, single-color line icons for the room header - swapped in for
// platform emoji (🔄🏠🔔📜👥🚪), which render as full-color pictograms no
// matter how flat the surrounding button chrome is. All draw in
// currentColor so they inherit the button's text color (and pick up the
// room's accent on hover) automatically, no per-icon color wiring needed.
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </Icon>
  );
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </Icon>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 9a5 5 0 0 1 10 0v4l1.5 3h-13L7 13Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function BellSlashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 9a5 5 0 0 1 10 0v4l1.5 3h-13L7 13Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
      <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
    </Icon>
  );
}

export function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 11a9 9 0 1 0 2.6-6.4" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </Icon>
  );
}

export function PeopleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2c2.6.4 4.5 2.6 4.5 5.8" />
    </Icon>
  );
}

export function PersonAddIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M18 8v6" />
      <path d="M15 11h6" />
    </Icon>
  );
}

export function DoorExitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h7" />
      <path d="M13 3v18" />
      <path d="M17 12h5" />
      <path d="M19 9l3 3-3 3" />
    </Icon>
  );
}

export function CloseCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </Icon>
  );
}

// ---- House Rules / Settings summary icons (RulesSummaryPanel) ----

export function DiceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <circle cx="8.3" cy="8.3" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.7" cy="8.3" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.3" cy="15.7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.7" cy="15.7" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function CoinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 15.5c0 1 1.1 1.8 2.5 1.8s2.5-.7 2.5-1.7c0-2.4-5-1.2-5-3.6 0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7" />
      <path d="M12 8.5v1M12 15.5v1" />
    </Icon>
  );
}

export function SwapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 8h13" />
      <path d="M14 4l3 4-3 4" />
      <path d="M20 16H7" />
      <path d="M10 12l-3 4 3 4" />
    </Icon>
  );
}

export function QuoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H10l-4 3v-3H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" transform="translate(1 0)" />
    </Icon>
  );
}

export function VoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      <path d="M3 10l9-6 9 6" />
      <path d="M9.5 13.5l1.8 1.8L14.5 12" />
    </Icon>
  );
}

export function NoScoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0Z" />
      <path d="M7 6H4.5A1.5 1.5 0 0 0 3 7.5C3 9 4 10 5.5 10.2" />
      <path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5c0 1.5-1 2.5-2.5 2.7" />
      <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
    </Icon>
  );
}

export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20l.9-4L16.5 4.4a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1L8 19l-4 1Z" />
      <path d="M14 6.5l3.5 3.5" />
    </Icon>
  );
}

export function PlusCardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 10v6M9 13h6" />
    </Icon>
  );
}

export function OneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.5 9.2l2-1.2v8" />
    </Icon>
  );
}

export function BoltCardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M13 8.5l-4 5h2.6L11 15.5l4-5h-2.6L13 8.5Z" />
    </Icon>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </Icon>
  );
}

export function PepperIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 6c1-1.5 2.5-2 4-1.7" />
      <path d="M8 8c-3 1-4.5 4-3.7 7.2C5 18 7.5 19.5 10 18.7c3-1 6.5-3.6 7.4-7C18 9 16.6 6.7 14.3 6.3 12 6 9.5 6.6 8 8Z" />
    </Icon>
  );
}

export function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" />
      <path d="M9 12l2 2 4-4.5" />
    </Icon>
  );
}

export function InboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 12h4.5l1.5 3h6l1.5-3H21" />
      <path d="M5 5h14l2 7v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7Z" />
    </Icon>
  );
}

export function LayersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3 2 9l10 6 10-6-10-6Z" />
      <path d="M2 15l10 6 10-6" />
      <path d="M2 12l10 6 10-6" />
    </Icon>
  );
}

export function FlagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 21V4" />
      <path d="M6 4h12l-3 4 3 4H6" />
    </Icon>
  );
}

export function CardsStackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="7" y="3" width="12" height="15" rx="2" transform="rotate(8 13 10.5)" />
      <rect x="4" y="6" width="12" height="15" rx="2" />
    </Icon>
  );
}

// ---- General-purpose icons (replacing remaining emoji app-wide) ----

export function CrownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13Z" />
      <path d="M6 20h12" />
    </Icon>
  );
}

export function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
      <path d="M7 5H4.5A1.5 1.5 0 0 0 3 6.5c0 1.8 1.2 3 3 3.2" />
      <path d="M17 5h2.5A1.5 1.5 0 0 1 21 6.5c0 1.8-1.2 3-3 3.2" />
      <path d="M12 14v3" />
      <path d="M8.5 20.5h7L15 17H9Z" />
    </Icon>
  );
}

export function MedalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 3l4 6 4-6" />
      <circle cx="12" cy="14" r="6.5" />
      <path d="M12 10.8l1.2 2.5 2.7.3-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.3Z" />
    </Icon>
  );
}

export function HandshakeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2 12l4-3.5 3 2 3-2.5 3 2.5 3-2 4 3.5" />
      <path d="M8 10.5l3 3-2 2a1.4 1.4 0 0 1-2-2Z" />
      <path d="M13.5 13.5l2 2a1.4 1.4 0 0 0 2-2l-3-3" />
    </Icon>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 12.5l5.5 5.5L20 6" />
    </Icon>
  );
}

export function CheckboxCheckedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </Icon>
  );
}

export function CheckboxEmptyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    </Icon>
  );
}

export function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Icon>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </Icon>
  );
}

export function RulerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="8" width="18" height="8" rx="1.5" transform="rotate(-6 12 12)" />
      <path d="M7.3 9.8l.6 1.6M10.6 9.3l.6 1.6M13.9 8.8l.6 1.6M17.2 8.3l.6 1.6" />
    </Icon>
  );
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" />
    </Icon>
  );
}

export function SkipForwardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 5v14l10-7Z" />
      <path d="M18 5v14" />
    </Icon>
  );
}

export function BackArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M19 12H6" />
      <path d="M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v12" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4 19h16" />
    </Icon>
  );
}

export function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 21V9" />
      <path d="M7.5 13.5L12 9l4.5 4.5" />
      <path d="M4 19h16" />
    </Icon>
  );
}

export function OpenWindowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
      <path d="M13 4h7v7" />
      <path d="M20 4l-9 9" />
    </Icon>
  );
}

export function ShuffleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 6h3.5c1.5 0 2.3.7 3.2 2" />
      <path d="M3 18h3.5c1.5 0 2.3-.7 3.2-2" />
      <path d="M13 8c1-1.5 2-2 3.5-2H21" />
      <path d="M13 16c1 1.5 2 2 3.5 2H21" />
      <path d="M18 3.5L21 6l-3 2.5" />
      <path d="M18 20.5L21 18l-3-2.5" />
    </Icon>
  );
}
