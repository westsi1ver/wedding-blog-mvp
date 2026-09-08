import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { consumeApiCall } from "./daily-limit";
import type { KeywordAnalysis, KeywordPlan } from "./types";


function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function geminiModels() { return Array.from(new Set([process.env.GEMINI_MODEL || "gemini-3.7-flash", ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.6-flash,gemini-3.5-flash-lite").split(",").map(x=>x.trim()).filter(Boolean)])); }
async function geminiGenerate(ai: GoogleGenAI, contents: any) {
  let last:any;
  for (const model of geminiModels()) {
    for (let attempt=0; attempt<3; attempt++) {
      try { return await ai.models.generateContent({ model, contents }); }
      catch(e:any) { last=e; const msg=String(e?.message||e); if(!/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg)) throw e; if(attempt<2) await sleep(1000*Math.pow(2,attempt)); }
    }
  }
  throw last || new Error("Gemini API 호출 실패");
}

function dataUrlPart(dataUrl: string) {
  const m = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

const systemRule = `당신은 실제 본식을 촬영하는 현직 웨딩스냅 메인작가이자 네이버 블로그 전문 에디터다.

블로그의 핵심 목적:
1) 고객 상담 시 원하는 식장과 홀의 실제 레퍼런스 사진을 인스타그램보다 훨씬 많이 보여주고, 포스팅 링크 하나로 쉽게 전달할 수 있게 한다.
2) 메인작가가 실제 촬영 경험을 바탕으로 홀 투어만으로는 얻기 어려운 조명, 동선, 촬영 포인트, 사진 결과물 관련 팁을 제공한다.

작성자 페르소나:
- 신부나 고객인 척 후기를 쓰지 않는다.
- '제가 결혼한다면', '너무 예쁘지 않나요?'처럼 고객 후기형 감탄문을 남발하지 않는다.
- 실제 본식 현장을 보는 메인작가의 시선으로 설명한다.
- 사진이 어떻게 나오는지, 어느 구간에서 어떤 장면을 확보하기 좋은지, 고객이 미리 알면 좋은 점을 설명한다.
- 판매 문구보다 사진 레퍼런스와 실용적인 현장 정보가 우선이다.
- 글을 읽은 고객이 '이 작가는 이 홀을 잘 알고 있구나'라고 느끼게 하되 과장하지 않는다.

사실 우선순위:
1) 작가 메모
2) 업로드 사진에서 직접 관찰 가능한 내용
3) 경쟁글 분석에서 확인된 구조적 특징
4) 일반적인 웨딩 지식

금지:
- 작가 메모나 사진으로 확인할 수 없는 식장 정보, 조명 변화, 시간대 특징, 실제 촬영 경험을 사실처럼 만들어내지 않는다.
- 경쟁글 문장을 베끼거나 유사하게 재작성하지 않는다.
- 키워드를 기계적으로 반복하지 않는다.
- 사진 개수나 특정 키워드 횟수가 상위노출을 보장한다고 표현하지 않는다.`;

function keywordPlanText(plan: KeywordPlan) {
  const extras = plan.additional.length
    ? plan.additional.map((x) => `- ${x.keyword}: 본문 ${x.min}~${x.max}회 목표`).join("\n")
    : "- 추가 키워드 없음";
  const required = plan.requiredPhrases.length ? plan.requiredPhrases.join(", ") : "없음";
  return `키워드 사용 계획:\n- 메인 키워드: ${plan.main.keyword} / 본문 ${plan.main.min}~${plan.main.max}회 목표\n${extras}\n- 반드시 포함할 표현: ${required}`;
}

function photoPlanText(analysis: KeywordAnalysis) {
  const p = analysis.commonAnalysis;
  return `상위 글 관찰 기반 사진 전략:
- 실제 포스팅 권장 총 사진 수: ${p.photoTotalMin}~${p.photoTotalMax}장
${p.photoPlan.map(x => `- ${x.section}: ${x.min}~${x.max}장 / ${x.note}`).join("\n")}
주의: 업로드한 최대 5장은 AI 분석용 대표사진이다. 원고에는 실제 포스팅에서 위 권장 사진 수를 배치할 수 있도록 [사진 1~N] 또는 [이 구간 사진 ${xSafe(p.photoTotalMin, p.photoTotalMax)}장] 식의 가이드를 제공한다.`;
}

function xSafe(min:number,max:number){ return `${min}~${max}`; }

function contextPrompt(keyword: string, memo: string, analysis: KeywordAnalysis, plan: KeywordPlan, customStrategy = "") {
  return `분석 키워드: ${keyword}
작가 메모: ${memo || "(없음)"}

경쟁 분석 핵심:
- 검색 결과 문서 수: ${analysis.totalResults}
- 경쟁 강도: ${analysis.competition}
- 상위 7개 본문 수집 성공: ${analysis.crawlSuccessCount}/${analysis.crawlTargetCount}
- 상위글 평균 원고량: ${analysis.averages.charCount ?? "수집 실패"}자
- 추천 본문 원고량: ${analysis.recommendedLength}
- 상위글 평균 이미지: ${analysis.averages.imageCount ?? "수집 실패"}장
- 상위글 평균 소제목: ${analysis.averages.headingCount ?? "수집 실패"}개

상위 7개 공통점:
${analysis.commonAnalysis.commonFeatures.map(x=>`- ${x}`).join("\n") || "- 분석값 없음"}

자주 등장하는 공통 키워드:
${analysis.commonAnalysis.commonKeywords.join(", ") || "없음"}

경쟁글의 빈틈/차별화 포인트:
${analysis.commonAnalysis.gaps.map(x=>`- ${x}`).join("\n") || "- 메인작가의 현장 팁을 강화한다."}

자동 생성된 콘텐츠 전략:
${analysis.commonAnalysis.contentStrategy}

${photoPlanText(analysis)}

${keywordPlanText(plan)}

사용자가 수정한 AI 작성 전략:
${customStrategy || analysis.strategyPrompt}

작성 규칙:
1. 제목 후보 5개를 먼저 제안한다.
2. 제목/해시태그/사진 배치 문구를 제외한 순수 본문은 ${analysis.recommendedLengthMin}~${analysis.recommendedLengthMax}자 범위를 목표로 한다.
3. 고객 상담용 레퍼런스 링크로 바로 보내도 충분하도록 식장/홀 사진 흐름을 이해하기 쉽게 구성한다.
4. 본문은 '홀/공간 → 신부대기실 → 식전/입장 → 본식 주요 순간 → 행진/플라워샤워/원판 → 메인작가의 홀 TIP → 상담 안내'를 기본 골격으로 삼되 사진과 메모에 맞게 조정한다.
5. 업로드된 최대 5장은 분석용 대표사진이다. 실제 포스팅에는 상위 글 분석에서 추천된 총 사진 수와 구간별 사진 수를 사용할 수 있도록 [사진 배치 가이드]를 상세히 넣는다.
6. 메인/추가 키워드는 지정된 횟수 범위에 가깝게 자연스럽게 분산한다.
7. 반드시 포함할 표현은 문맥에 맞게 포함한다.
8. '메인작가가 알려드리는 이 홀 촬영 TIP' 또는 의미가 비슷한 독립 섹션을 반드시 만든다.
9. 작가 메모에 없는 경험은 '직접 촬영해보니'라고 단정하지 않는다.
10. 마지막에는 과하지 않은 상담 유도 문구와 해시태그를 작성한다.`;
}

export async function runGemini(keyword: string, memo: string, analysis: KeywordAnalysis, images: string[], plan: KeywordPlan, customStrategy = "") {
  if (!process.env.GEMINI_API_KEY) return "[Gemini API 키가 없어 데모 모드입니다.] Gemini 원고가 여기에 표시됩니다.";
  await consumeApiCall("gemini");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const imageParts = images.map(dataUrlPart).filter(Boolean).map((x) => ({ inlineData: x! }));
  const response = await geminiGenerate(ai, [{
      role: "user",
      parts: [
        { text: `${systemRule}\n\n${contextPrompt(keyword, memo, analysis, plan, customStrategy)}\n\n사진이 있다면 먼저 각 대표사진에서 확실히 관찰 가능한 포인트를 짧게 정리한 뒤 원고를 작성한다.` },
        ...imageParts,
      ],
    }]);
  return response.text || "Gemini 응답이 비어 있습니다.";
}

export async function runOpenAI(keyword: string, memo: string, analysis: KeywordAnalysis, images: string[], plan: KeywordPlan, customStrategy = "") {
  if (!process.env.OPENAI_API_KEY) return "[OpenAI API 키가 없어 데모 모드입니다.] ChatGPT 원고가 여기에 표시됩니다.";
  await consumeApiCall("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const content: any[] = [{ type: "input_text", text: `${systemRule}\n\n${contextPrompt(keyword, memo, analysis, plan, customStrategy)}` }];
  for (const url of images) content.push({ type: "input_image", image_url: url });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    input: [{ role: "user", content }],
  });
  return response.output_text || "OpenAI 응답이 비어 있습니다.";
}

export async function mergeDrafts(keyword: string, memo: string, analysis: KeywordAnalysis, plan: KeywordPlan, gemini: string, gpt: string, customStrategy = "") {
  if (!process.env.OPENAI_API_KEY) return gemini;
  await consumeApiCall("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `${systemRule}\n\n${contextPrompt(keyword, memo, analysis, plan, customStrategy)}\n\nGemini 초안:\n${gemini}\n\nChatGPT 초안:\n${gpt}\n\n두 초안의 장점만 합쳐 최종 네이버 블로그 원고를 작성한다. 경쟁글 문장은 복사하지 않는다. 추천 분량, 작가 페르소나, 사진 배치 전략, 키워드 목표를 유지한다.`;
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    input: prompt,
  });
  return response.output_text || gemini;
}
