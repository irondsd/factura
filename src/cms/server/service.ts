import "server-only";
import { cmsMediaStore } from "../media/server/store";
import { writeRevisionUsage } from "../media/server/usage";
import { CmsContentService, type MediaUsageRecorder } from "./contentService";
import { createCmsValidator } from "./validation";

/** Record which images a stored revision uses, on the transaction that is
 * writing it.
 *
 * Bound here rather than inside the service so the service keeps no dependency
 * on the media library — see `MediaUsageRecorder`. This is the only wiring
 * between the two, and it is one direction: content writes tell the library
 * what they reference, and the library never reaches back to change content. */
const recordMediaUsage: MediaUsageRecorder = ({ revision, now, tx }) =>
  writeRevisionUsage({ store: cmsMediaStore.bind(tx), revision, now });

/** The one content service instance shared by browser actions and CMS MCP. */
export const cmsContentService = new CmsContentService(
  createCmsValidator(),
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  recordMediaUsage,
);
