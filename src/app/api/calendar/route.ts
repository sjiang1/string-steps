import { NextRequest, NextResponse } from "next/server";
import { getMonthProgress } from "../../actions";

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({}, { status: 400 });
  }
  const progress = await getMonthProgress(month);
  return NextResponse.json(progress);
}
