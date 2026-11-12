import { basePath } from "@bargames/gamekit/client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import QRCode from "qrcode";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import RulesSummaryPanel from "./RulesSummaryPanel.js";

export default function InvitePanel({
  roomCode,
  size = "default",
  state,
  leftContent,
}: {
  roomCode: string;
  size?: "default" | "large";
  /** Only passed (and only rendered) alongside the Table's large invite -
   * a glanceable House Rules/Settings summary beside the QR. */
  state?: RoomStateForClient;
  /** Large Table variant only: rendered as a third column, to the left of
   * the QR - the joined-players roster, so a full table of players uses
   * the hero's width instead of stacking in its own panel below and
   * running off the bottom of a Lobby-phase Shared Screen. */
  leftContent?: ReactNode;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // basePath(): the invite must keep the prefix when the game is served
  // under one (https://venue/nofilter/room/ABCD).
  const link = `${window.location.origin}${basePath()}/room/${roomCode}`;
  const large = size === "large";

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: large ? 560 : 200 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [link, large]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS LAN access) — the link is still shown for manual copy.
    }
  }

  if (large && state) {
    return (
      <div className="panel">
        <h2>Invite</h2>
        <div className="invite-top-row">
          {leftContent && <div className="invite-players-col">{leftContent}</div>}
          {qrDataUrl && <img src={qrDataUrl} alt="Room invite QR code" className="invite-qr large" />}
          <RulesSummaryPanel state={state} />
        </div>
        <div className="invite-link-row">
          <code className="invite-link large">{link}</code>
          <button type="button" onClick={copyLink}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Invite</h2>
      <div className="invite-row">
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt="Room invite QR code"
            className={large ? "invite-qr large" : "invite-qr"}
          />
        )}
        <div className="stack">
          <code className={large ? "invite-link large" : "invite-link"}>{link}</code>
          <button type="button" onClick={copyLink}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}
