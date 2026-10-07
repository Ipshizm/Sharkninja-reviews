import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  EmptyImportError,
  InvalidSkuError,
  ingestBuffer,
  ingestText,
  UnmappedSheetsError,
} from "@/lib/ingest";
import { ReadOnlyStoreError } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED = /\.(xlsx|xlsm|xls|csv)$/i;

/**
 * Accepts multipart uploads (file drop), JSON with direct pasted review text
 * { skuId, text }, or JSON with base64 file buffer.
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const files: { name: string; buf: Buffer }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const entry of form.getAll("file")) {
        if (entry instanceof File) {
          files.push({
            name: entry.name,
            buf: Buffer.from(await entry.arrayBuffer()),
          });
        }
      }
    } else {
      const body = (await req.json()) as {
        filename?: string;
        base64?: string;
        skuId?: string;
        text?: string;
      };

      if (body.skuId && typeof body.text === "string") {
        if (!body.text.trim()) {
          return NextResponse.json(
            { error: "No review text provided to import." },
            { status: 400 },
          );
        }
        if (body.text.length > 2_000_000) {
          return NextResponse.json(
            { error: "Pasted text exceeds maximum size of 2MB." },
            { status: 413 },
          );
        }
        const report = await ingestText(
          body.skuId,
          body.text,
          body.filename ?? "Pasted reviews",
        );
        revalidatePath("/", "layout");
        revalidatePath("/upload");
        return NextResponse.json({ ok: true, reports: [report] });
      }

      if (!body.base64) {
        return NextResponse.json(
          { error: "Send multipart 'file' fields, JSON { skuId, text }, or JSON { filename, base64 }." },
          { status: 400 },
        );
      }
      files.push({
        name: body.filename ?? "upload.xlsx",
        buf: Buffer.from(body.base64, "base64"),
      });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }

    const wrongType = files.filter((f) => !ACCEPTED.test(f.name));
    if (wrongType.length > 0) {
      return NextResponse.json(
        {
          error: `${wrongType.map((f) => f.name).join(", ")} is not a spreadsheet. Send .xlsx, .xls or .csv.`,
        },
        { status: 415 },
      );
    }

    // Each file stands alone: one bad file must not hide that an earlier one
    // was already saved, so failures are reported per file.
    const reports = [];
    const failures: { filename: string; error: string; unmappedSheets?: string[] }[] = [];
    for (const f of files) {
      try {
        reports.push(await ingestBuffer(f.buf, f.name));
      } catch (err) {
        if (err instanceof ReadOnlyStoreError) throw err;
        failures.push({
          filename: f.name,
          error: err instanceof Error ? err.message : "Unknown error",
          unmappedSheets: err instanceof UnmappedSheetsError ? err.sheets : undefined,
        });
      }
    }

    if (reports.length > 0) {
      revalidatePath("/", "layout");
      revalidatePath("/upload");
    }

    if (reports.length === 0 && failures.length === 1) {
      const only = failures[0];
      return NextResponse.json(
        { error: only.error, unmappedSheets: only.unmappedSheets, failures },
        { status: only.unmappedSheets ? 422 : 400 },
      );
    }
    if (reports.length === 0) {
      return NextResponse.json(
        { error: "None of the files could be imported.", failures },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, reports, failures });
  } catch (err) {
    // Raised before anything is written, so "nothing was imported" is accurate.
    if (err instanceof InvalidSkuError || err instanceof EmptyImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof UnmappedSheetsError) {
      return NextResponse.json(
        { error: err.message, unmappedSheets: err.sheets },
        { status: 422 },
      );
    }
    if (err instanceof ReadOnlyStoreError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
