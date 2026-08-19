import "server-only";
import { CmsContentService } from "./contentService";
import { createCmsValidator } from "./validation";

/** The one content service instance shared by browser actions and CMS MCP. */
export const cmsContentService = new CmsContentService(createCmsValidator());
