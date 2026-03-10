import { NextResponse } from "next/server";
import { saveUploadedImageAsset } from "@/lib/slides/assets";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "image file only" }, { status: 400 });
  }

  const stored = await saveUploadedImageAsset({
    sessionId: id,
    file,
  });

  return NextResponse.json(
    {
      fileName: stored.fileName,
      assetPath: stored.assetPath,
      src: stored.publicUrl,
    },
    { status: 201 }
  );
}
