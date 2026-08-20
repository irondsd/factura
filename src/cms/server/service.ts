import "server-only";
import { cmsMediaStore } from "../media/server/store";
import { writePageUsage } from "../media/server/usage";
import { CmsContentService, type MediaUsageRecorder } from "./contentService";
import { createCmsValidator } from "./validation";

/** Record which images a saved page uses, on the transaction that is saving it.
 *
 * Bound here rather than inside the service so the service keeps no dependency
 * on the media library — see `MediaUsageRecorder`. This is the only wiring
 * between the two, and it is one direction: content saves tell the library what
 * they reference, and the library never reaches back to change content. */
const recordMediaUsage: MediaUsageRecorder = ({ page, now, tx }) =>
  writePageUsage({ store: cmsMediaStore.bind(tx), page, now });

/** The one content service instance shared by browser actions and CMS MCP. */
export const cmsContentService = new CmsContentService(
  createCmsValidator(),
  undefined,
  undefined,
  undefined,
  undefined,
  recordMediaUsage,
);
