import { NextResponse } from "next/server";
import { getApiUsage } from "../../../lib/daily-limit";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getApiUsage());
}
