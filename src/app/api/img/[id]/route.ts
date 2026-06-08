import { NextRequest, NextResponse } from "next/server";
import { getChecklistImageBlobUrl } from "../../../actions";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const blobUrl = await getChecklistImageBlobUrl(id);
  if (!blobUrl) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.redirect(blobUrl, 302);
}
