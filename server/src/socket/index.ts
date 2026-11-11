import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, JoinAck, JoinAckError, ServerToClientEvents } from "@tabletop-judge/shared";
import { BACKGROUND_STYLES, TABLE_THEME_LABELS } from "@tabletop-judge/shared";
import { RoomManager } from "../rooms/RoomManager.js";
import { toErrorPayload } from "../rooms/errors.js";
import { log } from "../util/logger.js";
import { adminConfigured, completeSetup, isValidToken, login, logout, setupNeeded } from "../admin/auth.js";
import type { Room } from "../rooms/Room.js";
import { customSetToPackSummary } from "../rooms/Room.js";
import { getCoreSetInfo, uploadCoreSet } from "../cards/coreSet.js";
import { setGameName } from "../gameName/store.js";
import { setDefaultRoleNames } from "../roleNames/store.js";
import { setDefaultTheme } from "../tableStyle/store.js";
import { deletePreset, listPresets, savePreset } from "../presets/store.js";
import { addBlackCard, addWhiteCard, deleteCard, listCustomCards, mergeUploadedCards } from "../customCards/store.js";
import {
  addBlackCard as addSetBlackCard,
  addWhiteCard as addSetWhiteCard,
  createSet,
  deleteCard as deleteSetCard,
  deleteSet,
  getCustomSets,
  listCustomSets,
} from "../customSets/store.js";
import {
  deletePreset as deleteGameSetupPreset,
  listPresets as listGameSetupPresets,
  savePreset as saveGameSetupPreset,
} from "../gameSetupPresets/store.js";
import {
  deletePreset as deletePackSelectionPreset,
  listPresets as listPackSelectionPresets,
  savePreset as savePackSelectionPreset,
} from "../packSelectionPresets/store.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: IO, roomManager: RoomManager): void {
  io.on("connection", (socket: IOSocket) => {
    let roomCode: string | null = null;
    let playerId: string | null = null;
    let playerName: string | null = null;
    // Authorisation lives on the connection, the same way roomCode/playerId
    // do - so a mutation is allowed because *this socket* logged in, with no
    // token to pass on every call.
    let isAdmin = false;

    // socket.io dispatches onAny listeners before the matching named
    // handler, so by the time a handler throws this already holds the event
    // that caused it. Cheaper than threading an event label through all ~40
    // withRoom call sites, and impossible to forget on a new one.
    let currentEvent = "unknown";
    socket.onAny((eventName: string) => {
      currentEvent = eventName;
    });

    /**
     * Guards a write to the shared content library (custom cards, sets,
     * presets) - stores that are global to the whole server rather than
     * scoped to a room, so an unauthenticated write reaches every game.
     *
     * Fails closed when no ADMIN_PASSWORD is configured: an unset env var
     * refuses writes rather than silently reopening the hole it exists to
     * close.
     */
    const requireAdmin = async (action: string): Promise<boolean> => {
      if (isAdmin) return true;
      const configured = await adminConfigured();
      log.warn("admin", "blocked unauthenticated write", { action, configured });
      socket.emit("errorMessage", {
        code: "ADMIN_REQUIRED",
        message: configured
          ? "Sign in as admin to change the shared card library."
          : "The shared card library is locked - no admin password is set on this server.",
      });
      return false;
    };

    const withRoom = (handler: (room: Room, playerId: string) => void) => {
      return () => {
        if (!roomCode || !playerId) return;
        const room = roomManager.getRoom(roomCode);
        if (!room) return;
        try {
          handler(room, playerId);
        } catch (err) {
          const payload = toErrorPayload(err);
          // The single most useful line in the log: every "it wouldn't let
          // me do X" report resolves to one of these, and before this they
          // went to the client and vanished with no server-side trace.
          log.warn("action", "rejected", {
            code: roomCode,
            player: playerName,
            event: currentEvent,
            error: payload.code,
            message: payload.message,
          });
          socket.emit("errorMessage", payload);
        }
      };
    };

    socket.on("adminLogin", async ({ password }, cb) => {
      const result = await login(typeof password === "string" ? password : "");
      if (!result.ok) {
        log.warn("admin", "failed login", { reason: result.reason });
        return cb({
          ok: false,
          error:
            result.reason === "throttled"
              ? "Too many sign-in attempts right now - wait a moment and try again."
              : undefined,
        });
      }
      isAdmin = true;
      log.info("admin", "logged in");
      cb({ ok: true, token: result.token });
    });

    // Re-authenticating with the issued token, so a reconnect doesn't force
    // the password to be typed again - and the password itself never has to
    // be stored client-side.
    socket.on("adminResume", ({ token }, cb) => {
      isAdmin = isValidToken(token);
      cb({ ok: isAdmin });
    });

    socket.on("adminLogout", ({ token }) => {
      logout(token);
      isAdmin = false;
    });

    socket.on("adminStatus", async (cb) =>
      cb({ configured: await adminConfigured(), isAdmin, setupNeeded: await setupNeeded() })
    );

    // First-run only - see auth.ts's completeSetup() for why this refuses
    // once something is already configured (env var or a prior wizard run).
    socket.on("adminCompleteSetup", async ({ password, confirm }, cb) => {
      if (typeof password !== "string" || password.length < 8) {
        return cb({ ok: false, error: "Password must be at least 8 characters." });
      }
      if (password !== confirm) {
        return cb({ ok: false, error: "Passwords don't match." });
      }
      const done = await completeSetup(password);
      if (!done) {
        return cb({ ok: false, error: "Setup was already completed - sign in instead." });
      }
      const result = await login(password);
      if (!result.ok) return cb({ ok: false, error: "Setup succeeded but sign-in failed - try logging in." });
      isAdmin = true;
      cb({ ok: true, token: result.token });
    });

    // Room management - unlike the card library, there's no legitimate
    // anonymous-read case for "what rooms are active right now", so the
    // list itself is gated the same as the writes below.
    socket.on("adminListRooms", async (cb) => {
      if (!(await requireAdmin("adminListRooms"))) return cb({ ok: false, error: "ADMIN_REQUIRED" });
      cb({ ok: true, rooms: roomManager.listRoomSummaries() });
    });

    socket.on("adminCloseRoom", async ({ code }, cb) => {
      if (!(await requireAdmin("adminCloseRoom"))) return cb({ ok: false });
      const closed = roomManager.closeRoom(code, "The host closed this room.");
      if (closed) log.info("room", "closed by admin", { code });
      cb({ ok: closed });
    });

    socket.on("adminCloseAllRooms", async (cb) => {
      if (!(await requireAdmin("adminCloseAllRooms"))) return cb({ ok: false, count: 0 });
      const count = roomManager.closeAllRooms("The host closed all rooms.");
      log.info("room", "all rooms closed by admin", { count });
      cb({ ok: true, count });
    });

    socket.on("createRoom", ({ name, role }, cb) => {
      try {
        const { room, player, token } = roomManager.createRoom(name, role, socket.id);
        roomCode = room.code;
        playerId = player.id;
        playerName = player.name;
        socket.join(room.code);
        log.info("room", "created", { code: room.code, host: player.name, role });
        const ack: JoinAck = { ok: true, token, roomCode: room.code };
        cb(ack);
        room.broadcast();
      } catch (err) {
        const payload = toErrorPayload(err);
        log.warn("room", "create failed", { name, role, error: payload.code });
        const ack: JoinAckError = { ok: false, error: payload };
        cb(ack);
      }
    });

    socket.on("joinRoom", ({ roomCode: code, name, role, token }, cb) => {
      try {
        const { room, player, token: outToken } = roomManager.joinRoom(code, name, role, token, socket.id);
        roomCode = room.code;
        playerId = player.id;
        playerName = player.name;
        socket.join(room.code);
        // A token that resolves to an existing seat is a reconnect, not a
        // new player - worth distinguishing, since "why did Alice vanish
        // and come back" is a common thing to have to explain.
        log.info("room", token ? "rejoined" : "joined", {
          code: room.code,
          name: player.name,
          role,
          phase: room.phase,
        });
        const ack: JoinAck = { ok: true, token: outToken, roomCode: room.code };
        cb(ack);
        room.broadcast();
      } catch (err) {
        const payload = toErrorPayload(err);
        log.warn("room", "join failed", { code, name, role, error: payload.code });
        const ack: JoinAckError = { ok: false, error: payload };
        cb(ack);
      }
    });

    socket.on(
      "updatePackSelection",
      (req) =>
        withRoom((room, pid) => room.updatePackSelection(pid, req.packIds))()
    );

    socket.on(
      "updateExcludedCards",
      (req) =>
        withRoom((room, pid) => room.updateExcludedCards(pid, req.cardIds))()
    );

    socket.on(
      "updateHouseRules",
      (req) =>
        withRoom((room, pid) => room.updateHouseRules(pid, req.houseRules))()
    );

    socket.on(
      "updateRoleNames",
      (req) =>
        withRoom((room, pid) => room.updateRoleNames(pid, req?.roleNames ?? {}))()
    );

    socket.on(
      "updateWinCondition",
      (req) =>
        withRoom((room, pid) => room.updateWinCondition(pid, req.target, req.mode))()
    );

    socket.on(
      "updateDeckOptions",
      (req) =>
        withRoom((room, pid) => room.updateDeckOptions(pid, req.deckOptions))()
    );

    socket.on(
      "updateTableStyle",
      (req) =>
        withRoom((room, pid) => room.updateTableStyle(pid, req.tableStyle))()
    );

    socket.on(
      "updateHandSize",
      (req) =>
        withRoom((room, pid) => room.updateHandSize(pid, req.value))()
    );

    socket.on("updateDoubleDownWindow", (req) =>
      withRoom((room, pid) => room.updateDoubleDownWindow(pid, req.value))()
    );

    socket.on("updatePersonalCardsSettings", (req) =>
      withRoom((room, pid) => room.updatePersonalCardsSettings(pid, req))()
    );

    socket.on("addPersonalCard", (req) => withRoom((room, pid) => room.addPersonalCard(pid, req.text))());

    socket.on("removePersonalCard", (req) =>
      withRoom((room, pid) => room.removePersonalCard(pid, req.cardId))()
    );

    socket.on("startGame", withRoom((room, pid) => room.startGame(pid)));

    socket.on("endGame", withRoom((room, pid) => room.endGame(pid)));

    // requireHost is public (see Room.ts) - used directly here rather than
    // through a new Room method, since actually removing the room from the
    // manager's map (not just kicking players) needs roomManager, which
    // only the socket layer has - matches how the admin route's closeRoom
    // and the idle-sweep both go through RoomManager.closeRoom.
    socket.on(
      "closeRoom",
      withRoom((room, pid) => {
        room.requireHost(pid);
        roomManager.closeRoom(room.code, "The host closed this room.");
      })
    );

    socket.on("playAgain", withRoom((room, pid) => room.playAgain(pid)));

    socket.on("skipBlackCard", withRoom((room, pid) => room.skipBlackCard(pid)));

    socket.on("skipJudgeTurn", withRoom((room, pid) => room.skipJudgeTurn(pid)));

    socket.on("excusePlayerThisRound", (req) =>
      withRoom((room, pid) => room.excusePlayerThisRound(pid, req.playerId))()
    );

    socket.on(
      "submitCustomBlackCard",
      (req) =>
        withRoom((room, pid) => room.submitCustomBlackCard(pid, req.text, req.pick))()
    );

    socket.on(
      "setBlackCardScale",
      (req) =>
        withRoom((room, pid) => room.setBlackCardScale(pid, req.value))()
    );

    socket.on(
      "setSpotlightScale",
      (req) =>
        withRoom((room, pid) => room.setSpotlightScale(pid, req.value))()
    );

    socket.on(
      "setScoreboardScale",
      (req) =>
        withRoom((room, pid) => room.setScoreboardScale(pid, req.value))()
    );

    socket.on("drawCards", withRoom((room, pid) => room.drawCards(pid)));

    socket.on("refreshHand", withRoom((room, pid) => room.refreshHand(pid)));

    socket.on(
      "submitCards",
      (req) =>
        withRoom((room, pid) => room.submitCards(pid, req.cardIds))()
    );

    socket.on("wagerDoubleDown", withRoom((room, pid) => room.wagerDoubleDown(pid)));

    socket.on("unsubmitCards", withRoom((room, pid) => room.unsubmitCards(pid)));

    socket.on("claimHost", withRoom((room, pid) => room.claimHost(pid)));

    socket.on("applyGameSetup", (req) => withRoom((room, pid) => room.applyGameSetup(pid, req.setup))());

    socket.on("listGameSetupPresets", async (cb) => cb(await listGameSetupPresets()));

    // Saves whatever the room is configured with right now, so the host
    // tweaks live settings and then names the result - rather than filling
    // in a separate form that could drift from the actual room.
    socket.on("saveGameSetupPreset", async ({ name }, cb) => {
      const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
      if (!room || !playerId) return cb(await listGameSetupPresets());
      try {
        room.requireLobbyAuthority(playerId);
      } catch {
        return cb(await listGameSetupPresets());
      }
      cb(await saveGameSetupPreset({ name, ...room.currentGameSetup() }));
    });

    socket.on("deleteGameSetupPreset", async ({ name }, cb) => {
      cb(await deleteGameSetupPreset(name));
    });

    socket.on(
      "tradeInCards",
      (req) =>
        withRoom((room, pid) => room.tradeInCards(pid, req.cardIds))()
    );

    socket.on(
      "playActionCard",
      (req) =>
        withRoom((room, pid) => room.playActionCard(pid, req.cardId, req.targetPlayerId, req.giveCardId))()
    );

    socket.on(
      "setActionCardDensity",
      (req) =>
        withRoom((room, pid) => room.setActionCardDensity(pid, req.value))()
    );

    socket.on("setActionCardTier", (req) =>
      withRoom((room, pid) => room.setActionCardTier(pid, req.cardId, req.tier))()
    );

    socket.on("setActionCardTierWeights", (req) =>
      withRoom((room, pid) => room.setActionCardTierWeights(pid, req))()
    );

    socket.on("shuffleSubmissions", withRoom((room, pid) => room.shuffleSubmissions(pid)));

    socket.on(
      "revealSubmission",
      (req) =>
        withRoom((room, pid) => room.revealSubmission(pid, req.submissionId))()
    );

    socket.on(
      "spotlightSubmission",
      (req) =>
        withRoom((room, pid) => room.spotlightSubmission(pid, req.submissionId))()
    );

    socket.on("clearSpotlight", withRoom((room, pid) => room.clearSpotlight(pid)));

    socket.on(
      "judgePick",
      (req) =>
        withRoom((room, pid) => room.judgePick(pid, req.submissionId))()
    );

    socket.on(
      "voteForSubmission",
      (req) =>
        withRoom((room, pid) => room.voteForSubmission(pid, req.submissionId))()
    );

    socket.on(
      "leaveRoom",
      withRoom((room, pid) => {
        room.leaveRoom(pid);
        socket.leave(room.code);
        roomCode = null;
        playerId = null;
      })
    );

    socket.on(
      "kickPlayer",
      (req) =>
        withRoom((room, pid) => room.kickPlayer(pid, req.playerId))()
    );

    socket.on(
      "transferHost",
      (req) =>
        withRoom((room, pid) => room.transferHost(pid, req.playerId))()
    );

    socket.on(
      "adjustTableScale",
      (req) =>
        withRoom((room, pid) => room.adjustTableScale(pid, req.delta))()
    );

    socket.on(
      "setTableScale",
      (req) =>
        withRoom((room, pid) => room.setTableScale(pid, req.value))()
    );

    // Global, not room-scoped - a shared design library visible from any
    // device that connects (host phone, Table, standalone editor), unlike
    // the localStorage this used to live in.
    socket.on("listTableStylePresets", async (cb) => {
      cb(await listPresets());
    });

    socket.on("saveTableStylePreset", async ({ preset }, cb) => {
      const name = preset.name.trim().slice(0, 60);
      if (!name) return;
      const presets = await savePreset({ ...preset, name });
      cb(presets);
      socket.broadcast.emit("tableStylePresetsUpdated", presets);
    });

    socket.on("deleteTableStylePreset", async ({ name }, cb) => {
      const presets = await deletePreset(name);
      cb(presets);
      socket.broadcast.emit("tableStylePresetsUpdated", presets);
    });

    // Global, not room-scoped - same trust model as presets.
    socket.on("listCustomCards", async (cb) => {
      cb(await listCustomCards());
    });

    socket.on("addCustomWhiteCard", async ({ text }, cb) => {
      if (!(await requireAdmin("addCustomWhiteCard"))) return cb(await listCustomCards());
      cb(await addWhiteCard(text));
    });

    socket.on("addCustomBlackCard", async ({ text, pick }, cb) => {
      if (!(await requireAdmin("addCustomBlackCard"))) return cb(await listCustomCards());
      cb(await addBlackCard(text, pick));
    });

    socket.on("deleteCustomCard", async ({ id }, cb) => {
      if (!(await requireAdmin("deleteCustomCard"))) return cb(await listCustomCards());
      cb(await deleteCard(id));
    });

    socket.on("uploadCustomCards", async (upload, cb) => {
      if (!(await requireAdmin("uploadCustomCards"))) return cb(await listCustomCards());
      cb(await mergeUploadedCards(upload));
    });

    // Global, not room-scoped - same trust model as the loose custom-cards
    // pool above, but each set is individually selectable per-room like a
    // real pack (see Room.buildDecks()), not opted into as a whole.
    socket.on("listCustomSets", async (cb) => {
      cb(await listCustomSets());
    });

    socket.on("createCustomSet", async ({ name, white, black }, cb) => {
      if (!(await requireAdmin("createCustomSet"))) return cb(await listCustomSets());
      cb(await createSet(name, white, black));
    });

    socket.on("addCustomSetWhiteCard", async ({ setId, text }, cb) => {
      if (!(await requireAdmin("addCustomSetWhiteCard"))) return cb(await listCustomSets());
      cb(await addSetWhiteCard(setId, text));
    });

    socket.on("addCustomSetBlackCard", async ({ setId, text, pick }, cb) => {
      if (!(await requireAdmin("addCustomSetBlackCard"))) return cb(await listCustomSets());
      cb(await addSetBlackCard(setId, text, pick));
    });

    socket.on("deleteCustomSetCard", async ({ setId, cardId }, cb) => {
      if (!(await requireAdmin("deleteCustomSetCard"))) return cb(await listCustomSets());
      cb(await deleteSetCard(setId, cardId));
    });

    socket.on("deleteCustomSet", async ({ setId }, cb) => {
      if (!(await requireAdmin("deleteCustomSet"))) return cb(await listCustomSets());
      cb(await deleteSet(setId));
    });

    // Global, not room-scoped - same trust model as Table Style presets.
    socket.on("listPackSelectionPresets", async (cb) => {
      cb(await listPackSelectionPresets());
    });

    socket.on("savePackSelectionPreset", async ({ preset }, cb) => {
      const name = preset.name.trim().slice(0, 60);
      if (!name) return;
      const presets = await savePackSelectionPreset({ ...preset, name });
      cb(presets);
      socket.broadcast.emit("packSelectionPresetsUpdated", presets);
    });

    socket.on("deletePackSelectionPreset", async ({ name }, cb) => {
      const presets = await deletePackSelectionPreset(name);
      cb(presets);
      socket.broadcast.emit("packSelectionPresetsUpdated", presets);
    });

    // Global, not room-scoped - pack contents come straight from the
    // shared card-data singleton (already indexed by pack id for
    // buildDecks()), not per-room state. Falls back to the Custom Sets
    // pool when the id isn't a static pack, same resolution order as
    // buildDecks() itself.
    socket.on("previewPack", ({ packId }, cb) => {
      // Resolve against *this room's* card data when the socket is in a
      // room. Pack ids are array indices, so after an admin uploads a new
      // Core Set the same id means a different pack - a room created
      // before the upload still lists the old packs (correctly, it keeps
      // playing with them), and previewing one against the manager's newer
      // copy silently returned a completely different pack's cards.
      const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
      const cardData = room?.getCardData() ?? roomManager.getCardData();
      const white = cardData.whiteByPack.get(packId);
      const black = cardData.blackByPack.get(packId);
      if (white && black) {
        cb({ white, black });
        return;
      }
      const set = getCustomSets().find((s) => s.id === packId);
      if (set) {
        cb({
          white: set.white.map((c) => ({ ...c, pack: packId })),
          black: set.black.map((c) => ({ ...c, pack: packId })),
        });
        return;
      }
      cb(null);
    });

    // Global, not room-scoped - the full merged pack list (static packs +
    // live Custom Sets), for the main-screen preset builder which has no
    // room/state of its own.
    socket.on("listAllPacks", (cb) => {
      cb([...roomManager.getCardData().packs, ...getCustomSets().map(customSetToPackSummary)]);
    });

    // Global, not room-scoped - what card data this deployment is running
    // on right now (bundled sample / an uploaded Core Set / an env
    // override). Read-public, same as previewPack/listAllPacks above.
    socket.on("getCoreSetInfo", (cb) => {
      cb(getCoreSetInfo(roomManager.getCardData()));
    });

    // Core Set *upload* is deliberately not a socket event - see the
    // POST /api/core-set route in server/src/index.ts for why (payload size).

    socket.on("setGameName", async ({ name }, cb) => {
      if (!(await requireAdmin("setGameName"))) return cb({ ok: false, error: "ADMIN_REQUIRED" });
      if (typeof name !== "string" || !name.trim()) return cb({ ok: false, error: "Name can't be empty." });
      const next = await setGameName(name);
      cb({ ok: true, name: next });
    });

    // Forward-looking only, like setDefaultTheme: RoomManager.createRoom()
    // reads the store directly, so rooms already open keep their names.
    socket.on("setDefaultRoleNames", async (req, cb) => {
      if (!(await requireAdmin("setDefaultRoleNames"))) return cb({ ok: false, error: "ADMIN_REQUIRED" });
      const roleNames = await setDefaultRoleNames(req?.roleNames);
      cb({ ok: true, roleNames });
    });

    socket.on(
      "setDefaultTheme",
      async ({ theme, accentIndex, backgroundStyle, backgroundAnimated, mobileBackgroundEnabled, facedownOpacity }, cb) => {
        if (!(await requireAdmin("setDefaultTheme"))) return cb({ ok: false, error: "ADMIN_REQUIRED" });
        if (!(theme in TABLE_THEME_LABELS)) return cb({ ok: false, error: "Unknown theme." });
        if (!BACKGROUND_STYLES.includes(backgroundStyle)) return cb({ ok: false, error: "Unknown background style." });
        const next = await setDefaultTheme({ theme, accentIndex, backgroundStyle, backgroundAnimated, mobileBackgroundEnabled, facedownOpacity });
        roomManager.setDefaultTheme(next);
        cb({
          ok: true,
          theme: next.theme,
          accentIndex: next.accentIndex,
          backgroundStyle: next.backgroundStyle,
          backgroundAnimated: next.backgroundAnimated,
          mobileBackgroundEnabled: next.mobileBackgroundEnabled,
          facedownOpacity: next.facedownOpacity,
        });
      }
    );

    socket.on("disconnect", (reason) => {
      if (!roomCode || !playerId) return;
      const room = roomManager.getRoom(roomCode);
      // Not a departure - the seat and hand are held for reconnect. Logged
      // because a flurry of these is the signature of a flaky connection,
      // which is otherwise invisible from the server side.
      log.info("room", "disconnected", { code: roomCode, name: playerName, reason });
      room?.markDisconnected(playerId);
    });
  });
}
