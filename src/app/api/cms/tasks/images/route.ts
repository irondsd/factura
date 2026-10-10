import { getCmsAccess } from "@/cms/auth/requireCmsMember";
import { MAX_TASK_IMAGE_BYTES } from "@/cms/tasks/images";
import { TaskImageError, uploadTaskImage } from "@/cms/tasks/server/images";

// A screenshot pasted into a task description. The body is the image itself,
// not a form: one file per request, and the response is its public address.
//
// A route handler rather than a Server Action because a Server Action's body
// is capped at 1 MB unless the cap is raised for every action in the app.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status: number) =>
  Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

/** Cookie-authenticated, so it only answers our own pages. A cross-site page
 * cannot send an `image/*` body without a preflight we never grant, and the
 * session cookie is `SameSite=Lax` anyway; this is the explicit check. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Origen no permitido.", 403);

  const access = await getCmsAccess();
  if (access.kind === "anonymous") return fail("Inicia sesión.", 401);
  if (access.kind !== "member") return fail("No encontrado.", 404);

  if (!request.headers.get("content-type")?.startsWith("image/"))
    return fail("Envía la imagen como cuerpo de la petición.", 415);

  // Weighed before it is read where the client says how much is coming, and
  // again after, because the header is only the client's word.
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_TASK_IMAGE_BYTES)
    return fail("La imagen supera el máximo de 2 MB.", 413);

  try {
    const raw = Buffer.from(await request.arrayBuffer());
    return Response.json(await uploadTaskImage(raw), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TaskImageError)
      return fail(error.message, error.status);
    throw error;
  }
}
