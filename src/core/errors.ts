import { translator } from "commendatore";
import { i18n } from "../messages.js";
import type { MessageKey } from "../messages.js";

export interface AppeaseMessage {
  key: MessageKey;
  params: (string | number)[];
}

/**
 * A problem in the user's input (config files, arguments, repo state), not a defect: the CLI shows it in one
 * line, in the user's language. `message` is in English, for library users.
 */
export class AppeaseError extends Error implements AppeaseMessage {
  readonly key: MessageKey;
  readonly params: (string | number)[];
  constructor(key: MessageKey, ...params: (string | number)[]) {
    super(translator(i18n, "en")(key, ...params));
    this.key = key;
    this.params = params;
  }
}
