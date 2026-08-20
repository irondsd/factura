import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cmsMedia } from "@/db/schema";
import { publicMediaUrl } from "@/content-system/media/origin";

// The editorial permalink, opened directly.
//
// Authored content says `/media/<id>/<name>.jpg` and the renderer resolves that
// to a source URL without ever leaving the server — this route is for the other
// case: somebody pasted the link, a crawler followed it, or an editor is
// checking what it points at.
//
// It redirects rather than proxying the bytes. Proxying would put every image
// request through the application and defeat the CDN in front of the bucket;
// the whole reason authored content carries an id instead of a hostname is that
// the hostname can be resolved late and cheaply.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id } = await params;

  const row = await db.query.cmsMedia.findFirst({
    where: eq(cmsMedia.id, id.toLowerCase()),
    columns: { objectKey: true, status: true },
  });

  if (!row) return new Response("Not found", { status: 404 });

  // Trashed or purged: `410 Gone` rather than `404`, because the difference is
  // real and worth telling a crawler. This image existed here and will not come
  // back; a 404 invites a retry.
  if (row.status !== "ready" || !row.objectKey) {
    return new Response("Gone", { status: 410 });
  }

  return Response.redirect(publicMediaUrl(row.objectKey), 308);
}
