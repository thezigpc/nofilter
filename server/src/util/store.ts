// The game's JSON file store: @bargames/gamekit's createJsonStore, rooted at
// DATA_DIR (or the project root standalone). Every caller passes an absolute
// *_PATH from config.ts, which the kit store accepts as-is, so operator path
// overrides keep working. A missing file reads as null; a damaged one is
// logged loudly, read as null and left untouched; writes are atomic.
import { createJsonStore } from "@bargames/gamekit/server";
import { dataRoot } from "../config.js";
import { log } from "./logger.js";

export const store = createJsonStore(dataRoot, log);
