import { NextResponse } from "next/server";
import { mergeDrafts, runGemini, runOpenAI } from "../../../lib/ai";
import type { KeywordPlan } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { keyword, memo, analysis, images, keywordPlan, useOpenAI = false, strategyPrompt = "" } = await req.json();
    if (!keyword || !analysis) return NextResponse.json({ error: "먼저 키워드 분석을 완료하세요." }, { status: 400 });
    if ((images || []).length > 5) return NextResponse.json({ error: "사진은 최대 5장입니다." }, { status: 400 });

    const plan = keywordPlan as KeywordPlan;
    if (!plan?.main?.keyword?.trim()) return NextResponse.json({ error: "메인 키워드를 입력하세요." }, { status: 400 });

    // Gemini는 기본 생성 엔진. OpenAI 설정/크레딧 상태와 무관하게 먼저 결과를 만든다.
    let gemini = "";
    try {
      gemini = await runGemini(keyword, memo || "", analysis, images || [], plan, strategyPrompt);
    } catch (e: any) {
      const code = e?.message || String(e) || "unknown";
      if (code === "DAILY_GEMINI_API_LIMIT_REACHED") {
        return NextResponse.json({ error: "오늘 Gemini API 호출 한도에 도달했습니다." }, { status: 429 });
      }
      console.error("[GEMINI ERROR]", e);
      return NextResponse.json({ error: `Gemini 원고 생성 중 오류: ${code}` }, { status: 500 });
    }

    // 기본 무료 모드: Gemini 결과만 반환한다.
    if (!useOpenAI) {
      return NextResponse.json({
        gemini,
        gpt: "",
        merged: gemini,
        mode: "gemini-only",
        openaiError: null,
      });
    }

    // 선택 모드: ChatGPT를 추가 호출한다. 실패해도 Gemini 결과는 유지한다.
    let gpt = "";
    let merged = gemini;
    let openaiError: string | null = null;

    try {
      gpt = await runOpenAI(keyword, memo || "", analysis, images || [], plan, strategyPrompt);
    } catch (e: any) {
      openaiError = e?.message || String(e) || "OpenAI 호출 실패";
      console.error("[OPENAI DRAFT ERROR]", e);
      return NextResponse.json({
        gemini,
        gpt: "",
        merged: gemini,
        mode: "gemini-fallback",
        openaiError,
      });
    }

    // GPT 초안까지 성공한 경우에만 통합본을 만든다.
    try {
      merged = await mergeDrafts(keyword, memo || "", analysis, plan, gemini, gpt, strategyPrompt);
    } catch (e: any) {
      openaiError = e?.message || String(e) || "통합본 생성 실패";
      console.error("[OPENAI MERGE ERROR]", e);
      // 통합 실패 시 Gemini를 최종 추천본으로 사용하고 GPT 초안도 그대로 노출한다.
      merged = gemini;
    }

    return NextResponse.json({
      gemini,
      gpt,
      merged,
      mode: openaiError ? "gemini-fallback" : "gemini-openai",
      openaiError,
    });
  } catch (e: any) {
    const code = e?.message || String(e) || "unknown";
    console.error("[GENERATE ROUTE FATAL]", e);
    return NextResponse.json({ error: `원고 생성 중 오류: ${code}` }, { status: 500 });
  }
}
