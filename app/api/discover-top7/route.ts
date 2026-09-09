import { NextResponse } from "next/server";
import { discoverActualNaverTopPosts } from "../../../lib/naver-search-browser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { keyword } = await req.json();
    const q = String(keyword || "").trim();
    if (!q) return NextResponse.json({ error: "검색 키워드를 입력하세요." }, { status: 400 });

    const items = await discoverActualNaverTopPosts(q, 7);
    return NextResponse.json({ keyword: q, items });
  } catch (e: any) {
    console.error("[NAVER PLAYWRIGHT DISCOVERY ERROR]", e);
    return NextResponse.json(
      {
        error:
          e?.message ||
          "네이버 실제 검색 화면 자동 수집에 실패했습니다. 잠시 후 다시 시도하거나 아래 수동 URL 입력을 사용하세요.",
      },
      { status: 502 }
    );
  }
}
