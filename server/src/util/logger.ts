// Structured logging via @bargames/gamekit's logger - same line format this
// game always used (`timestamp LEVEL [scope] message key=value`), so one
// room's history still greps out with `code=ABCD`. LOG_LEVEL sets verbosity.
import { createLogger, type LogLevel } from "@bargames/gamekit/server";
import { LOG_LEVEL } from "../config.js";

export const log = createLogger({ level: LOG_LEVEL as LogLevel });
