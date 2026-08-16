import { TEXT_PREVIEW_CHARS } from "@/lib/probar";
import { normalize } from "@/parsers/normalize";
import {
  getObjectBytes,
  isStorageConfigured,
  presignDownload,
} from "@/server/storage";
import type { SubmissionRow } from "@/server/submissions";
import {
  buildUnrecognizedBillMessage,
  isTelegramConfigured,
  sendTelegramDocument,
  sendTelegramMessage,
} from "@/server/telegram";

/** "Nobody could read this bill" → the Telegram channel.
 *
 * The bills /probar fails on are the reason the page exists — they're the queue
 * of parsers to write next — and a row in a table nobody opens is not how that
 * gets noticed. The channel already carries the contact form, so this lands in
 * the same place, while the visitor who sent it is still around to answer.
 *
 * Best-effort in every direction: called from `after()`, so it never delays or
 * fails the parse response, and every step degrades rather than throws.
 */

/** How long the fallback link stays good. Only used when the PDF itself
 * couldn't be attached, and generous because a channel post is read whenever
 * it's read — the 5-minute default of `presignDownload` exists for a browser
 * that's about to follow the link immediately. SigV4 caps at 7 days. */
const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Post an unrecognized submission to the channel: the original PDF with the
 * details as its caption, or — if there's no stored file, or the upload fails —
 * the same details with a signed link, or with no file at all. */
export async function notifyUnrecognizedSubmission(
  row: SubmissionRow,
): Promise<void> {
  const bill = {
    submissionId: row.id,
    fileName: row.fileName,
    fileBytes: row.fileBytes,
    pageCount: row.pageCount,
    locale: row.locale,
    vendorGuess: row.vendorGuess,
    textPreview: normalize(row.rawText).slice(0, TEXT_PREVIEW_CHARS),
  };

  // No channel (local dev, CI): `sendTelegramMessage` logs the post to the
  // console, which is the whole local destination — so don't spend an S3 GET on
  // an attachment that has nowhere to go.
  const canAttach =
    Boolean(row.storageKey) && isStorageConfigured() && isTelegramConfigured();

  if (canAttach) {
    try {
      const bytes = await getObjectBytes(row.storageKey!);
      const sent = await sendTelegramDocument(
        { bytes, fileName: row.fileName },
        buildUnrecognizedBillMessage(bill),
      );
      if (sent.ok) return;
    } catch (err) {
      console.warn(`[probar] could not attach ${row.fileName}:`, err);
    }
  }

  // Falling back: a link is worth having when the object exists and only the
  // attachment failed, and costs nothing when it doesn't.
  let downloadUrl: string | null = null;
  if (row.storageKey && isStorageConfigured()) {
    try {
      downloadUrl = await presignDownload(row.storageKey, LINK_TTL_SECONDS);
    } catch (err) {
      console.warn(`[probar] could not sign a link for ${row.fileName}:`, err);
    }
  }

  await sendTelegramMessage(
    buildUnrecognizedBillMessage({ ...bill, downloadUrl }),
  );
}
