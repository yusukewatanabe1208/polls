import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getBackend } from "@/lib/config";

/** ローカルモードで .data/uploads に保存した画像を配信する */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  if (getBackend() !== "local") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { name } = await params;
  // パストラバーサル防止：ファイル名のみ許可
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const filePath = path.join(process.cwd(), ".data", "uploads", name);
  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(name).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  return new NextResponse(new Uint8Array(fs.readFileSync(filePath)), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
