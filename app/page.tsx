"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ApiUsage,
  KeywordAnalysis,
  KeywordPlan,
  KeywordTarget,
} from "../lib/types";

function fmt(v: number | null) {
  return v == null ? "수집 실패" : v.toLocaleString();
}
function countKeyword(text: string, keyword: string) {
  const k = keyword.replace(/\s+/g, "");
  const t = text.replace(/\s+/g, "");
  return k ? t.split(k).length - 1 : 0;
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>(
    Array(7).fill(""),
  );
  const [analysis, setAnalysis] = useState<KeywordAnalysis | null>(null);
  const [memo, setMemo] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<{
    gemini: string;
    gpt: string;
    merged: string;
  } | null>(null);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [mainKeyword, setMainKeyword] = useState("");
  const [mainMin, setMainMin] = useState(4);
  const [mainMax, setMainMax] = useState(7);
  const [additional, setAdditional] = useState<KeywordTarget[]>([]);
  const [requiredText, setRequiredText] = useState("메인작가, 본식스냅");
  const [strategyPrompt, setStrategyPrompt] = useState("");
  const [useOpenAI, setUseOpenAI] = useState(false);
  const [openaiNotice, setOpenaiNotice] = useState("");
  const [discoveryNote, setDiscoveryNote] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisProgressText, setAnalysisProgressText] = useState("");

  const canGenerate = useMemo(
    () => !!analysis && !!mainKeyword.trim() && !generating,
    [analysis, mainKeyword, generating],
  );

  async function refreshUsage() {
    try {
      const r = await fetch("/api/usage", { cache: "no-store" });
      if (r.ok) setUsage(await r.json());
    } catch {}
  }
  useEffect(() => {
    refreshUsage();
  }, []);

  async function analyze(autoDiscover = true) {
    setError("");
    setDiscoveryNote("");
    setLoading(true);
    setAnalysis(null);
    setDrafts(null);
    setAnalysisProgress(6);
    setAnalysisProgressText(
      autoDiscover
        ? "네이버 모바일 검색 페이지를 준비하고 있어요..."
        : "입력한 URL을 확인하고 있어요...",
    );

    let progressTimer: ReturnType<typeof setInterval> | null = null;

    // 실제 백엔드 진행률을 실시간 스트리밍하는 구조는 아니므로,
    // 현재 단계 안에서는 진행바가 멈춰 보이지 않도록 천천히 증가시킵니다.
    const startSoftProgress = (ceiling: number) => {
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = setInterval(() => {
        setAnalysisProgress((prev) => {
          if (prev >= ceiling) return prev;
          const gap = ceiling - prev;
          return Math.min(ceiling, prev + Math.max(1, Math.ceil(gap * 0.08)));
        });
      }, 700);
    };

    try {
      let urls = competitorUrls.filter(Boolean);

      if (autoDiscover) {
        setAnalysisProgress(12);
        setAnalysisProgressText(
          "Playwright로 네이버 모바일 검색 결과에 접속하고 있어요...",
        );
        startSoftProgress(34);
        setDiscoveryNote(
          "Playwright가 실제 네이버 모바일 검색 화면을 열어 블로그 노출 순서를 확인하고 있습니다...",
        );

        const d = await fetch("/api/discover-top7", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword }),
        });
        const dj = await d.json();

        if (d.ok && Array.isArray(dj.items) && dj.items.length) {
          urls = dj.items.map((x: any) => x.url).slice(0, 7);
          setCompetitorUrls([
            ...urls,
            ...Array(Math.max(0, 7 - urls.length)).fill(""),
          ]);
          setAnalysisProgress(42);
          setAnalysisProgressText(
            `${urls.length}개 상위 블로그를 찾았어요. 각 글의 본문과 사진 구성을 읽고 있어요...`,
          );
          setDiscoveryNote(
            `실제 네이버 검색 화면에서 ${urls.length}개 블로그 글을 자동으로 찾았습니다. 이제 각 글 본문과 대표 이미지를 심층 분석합니다.`,
          );
        } else if (urls.length) {
          setAnalysisProgress(42);
          setAnalysisProgressText(
            "자동 수집 대신 입력된 URL의 본문을 분석하고 있어요...",
          );
          setDiscoveryNote(
            `자동 순위 수집은 실패했습니다. 입력되어 있던 ${urls.length}개 URL로 분석을 계속합니다. (${dj.error || "원인 미상"})`,
          );
        } else {
          throw new Error(
            `${dj.error || "실제 네이버 검색 결과 자동 수집에 실패했습니다."}\n아래 수동 URL 입력란에 글 주소를 넣고 '입력 URL로 분석'을 사용할 수도 있습니다.`,
          );
        }
      } else {
        setAnalysisProgress(35);
        setAnalysisProgressText(
          "입력한 경쟁글의 본문과 사진 구성을 읽고 있어요...",
        );
      }

      startSoftProgress(82);
      const r = await fetch("/api/analyze-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, competitorUrls: urls }),
      });

      setAnalysisProgress(86);
      setAnalysisProgressText(
        "상위 글의 공통 키워드와 특징을 정리하고 있어요...",
      );

      const j = await r.json();
      if (!r.ok) throw new Error(j.error);

      setAnalysisProgress(94);
      setAnalysisProgressText(
        "추천 원고량·사진 구성·AI 작성 전략을 만들고 있어요...",
      );
      setAnalysis(j);
      setMainKeyword(j.keyword);
      setStrategyPrompt(j.strategyPrompt || "");

      const avg = Number(j.averages?.keywordCount);
      if (Number.isFinite(avg) && avg > 0) {
        setMainMin(Math.max(3, Math.min(7, avg - 1)));
        setMainMax(Math.max(5, Math.min(9, avg + 1)));
      } else {
        setMainMin(4);
        setMainMax(7);
      }

      const suggestions = (j.commonAnalysis?.suggestedKeywords || [])
        .filter((x: any) => x.keyword && x.keyword !== j.keyword)
        .map((x: any) => ({
          keyword: x.keyword,
          min: x.min || 1,
          max: x.max || 3,
        }));
      setAdditional(suggestions);
      await refreshUsage();

      setAnalysisProgress(100);
      setAnalysisProgressText("분석이 완료되었습니다.");
    } catch (e: any) {
      setError(e.message);
      setAnalysisProgress(0);
      setAnalysisProgressText("");
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setLoading(false);
    }
  }

  async function addImages(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, Math.max(0, 5 - images.length));
    const urls = await Promise.all(
      picked.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();
            reader.onload = () => {
              img.onload = () => {
                const max = 1400;
                const scale = Math.min(
                  1,
                  max / Math.max(img.width, img.height),
                );
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas
                  .getContext("2d")!
                  .drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.78));
              };
              img.onerror = reject;
              img.src = reader.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
      ),
    );
    setImages((prev) => [...prev, ...urls].slice(0, 5));
  }

  function addKeywordTarget(value = "") {
    const trimmed = value.trim();
    if (
      trimmed &&
      (trimmed === mainKeyword.trim() ||
        additional.some((x) => x.keyword === trimmed))
    )
      return;
    setAdditional((prev) => [...prev, { keyword: trimmed, min: 1, max: 3 }]);
  }
  function updateAdditional(index: number, patch: Partial<KeywordTarget>) {
    setAdditional((prev) =>
      prev.map((x, i) => (i === index ? { ...x, ...patch } : x)),
    );
  }
  function keywordPlan(): KeywordPlan {
    return {
      main: { keyword: mainKeyword.trim(), min: mainMin, max: mainMax },
      additional: additional
        .filter((x) => x.keyword.trim())
        .map((x) => ({ ...x, keyword: x.keyword.trim() })),
      requiredPhrases: requiredText
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
    };
  }

  async function generate() {
    if (!analysis) return;
    setError("");
    setOpenaiNotice("");
    setGenerating(true);
    setDrafts(null);
    try {
      const r = await fetch("/api/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          memo,
          analysis,
          images,
          keywordPlan: keywordPlan(),
          useOpenAI,
          strategyPrompt,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDrafts(j);
      if (j.openaiError)
        setOpenaiNotice(
          `ChatGPT 호출은 실패했지만 Gemini 원고는 정상 생성되었습니다.\n${j.openaiError}`,
        );
      await refreshUsage();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const plan = keywordPlan();

  return (
    <main className="wrap">
      <section className="hero">
        <span className="pill">레몬과 깔라만씨의</span>
        <h1>Wedding Blog Assistant</h1>
        <p>
          실제 네이버에서 확인한 상위 7개 웨딩스냅 글을 본문과 대표 이미지까지
          분석하고, 상담용 레퍼런스와 메인작가의 현장 팁이 살아있는 네이버
          블로그 원고를 만듭니다.
        </p>
        {usage && (
          <div className="usageBar">
            <Usage name="NAVER" item={usage.naver} />
            <Usage name="Gemini" item={usage.gemini} />
            <Usage name="OpenAI" item={usage.openai} />
            <span className="usageDate">{usage.date} 기준</span>
          </div>
        )}
      </section>

      <section className="purposeCard">
        <b>이 블로그의 운영 목적</b>
        <p>
          ① 고객 상담 시 원하는 식장·홀 레퍼런스 사진을 인스타그램보다 많이
          정리해 포스팅 링크 하나로 제공
        </p>
        <p>
          ② 메인작가가 직접 보는 촬영 관점의 식장 꿀팁을 더해, 홀 투어만으로
          얻기 힘든 정보를 제공
        </p>
      </section>

      <section className="card">
        <div className="step">STEP 1</div>
        <h2>키워드 & 실제 네이버 상위 7개 심층 분석</h2>
        <div className="row">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예: 서울웨딩타워 스냅"
          />
          <button
            onClick={() => analyze(true)}
            disabled={!keyword.trim() || loading}
          >
            {loading
              ? "실제 네이버 순위 확인 중..."
              : "실제 순위 자동수집 + 분석"}
          </button>
        </div>
        <p
          className="helper"
          style={{
            marginTop: 12,
            marginBottom: 0,
            lineHeight: 1.6,
          }}
        >
          Playwright가 사람의 브라우저처럼 네이버 모바일 통합검색을 열고, 화면에
          노출된 네이버 블로그 글을 위에서부터 최대 7개 찾아 분석합니다.
        </p>
        {(loading || analysisProgress > 0) && (
          <div
            style={{
              marginTop: 16,
              padding: "16px 18px",
              border: "1px solid #e6ded4",
              borderRadius: 14,
              background: "#fbf8f3",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
                fontSize: 14,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {analysisProgressText || "분석 준비 중..."}
              </span>
              <strong style={{ whiteSpace: "nowrap" }}>
                {analysisProgress}%
              </strong>
            </div>
            <div
              style={{
                width: "100%",
                height: 10,
                borderRadius: 999,
                background: "#e8e2da",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${analysisProgress}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "#191816",
                  transition: "width 0.45s ease",
                }}
              />
            </div>
            {loading && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 6,
                  marginTop: 12,
                  fontSize: 11,
                  color: "#7c746b",
                }}
              >
                {[
                  "검색 접속",
                  "상위글 수집",
                  "본문·사진 분석",
                  "공통점 분석",
                  "전략 생성",
                ].map((label, index) => {
                  const threshold = [10, 35, 55, 82, 94][index];
                  const active = analysisProgress >= threshold;
                  return (
                    <span
                      key={label}
                      style={{
                        textAlign: "center",
                        fontWeight: active ? 700 : 400,
                        opacity: active ? 1 : 0.55,
                      }}
                    >
                      {active ? "✓ " : ""}
                      {label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {discoveryNote && <div className="discoveryNote">{discoveryNote}</div>}
        <details className="manualFallback">
          <summary>자동 수집이 안 될 때: URL 직접 입력</summary>
          <div className="rankUrlBox">
            <b>수동 경쟁글 1~7위 URL</b>
            <p>
              네이버가 자동 브라우저 접근을 제한하거나 검색 화면 구조가 바뀐
              경우에만 사용하세요. 입력 순서를 실제 노출 순위로 간주합니다.
            </p>
            {competitorUrls.map((u, i) => (
              <label key={i}>
                <span>{i + 1}위</span>
                <input
                  value={u}
                  onChange={(e) =>
                    setCompetitorUrls((prev) =>
                      prev.map((x, idx) => (idx === i ? e.target.value : x)),
                    )
                  }
                  placeholder="https://blog.naver.com/..."
                />
              </label>
            ))}
            <button
              className="manualAnalyzeButton"
              onClick={() => analyze(false)}
              disabled={
                !keyword.trim() || loading || !competitorUrls.some(Boolean)
              }
            >
              입력 URL로 분석
            </button>
          </div>
        </details>
        {error && <div className="error">{error}</div>}
        {analysis && (
          <div className="analysis">
            <div className="metrics">
              <Metric
                name="검색 결과"
                value={analysis.totalResults.toLocaleString()}
              />
              <Metric name="경쟁 강도" value={analysis.competition} />
              <Metric
                name="본문 수집"
                value={`${analysis.crawlSuccessCount}/${analysis.crawlTargetCount}개`}
              />
              <Metric
                name="평균 원고량"
                value={`${fmt(analysis.averages.charCount)}자`}
              />
              <Metric name="추천 원고량" value={analysis.recommendedLength} />
              <Metric
                name="평균 사진"
                value={fmt(analysis.averages.imageCount)}
              />
              <Metric
                name="추천 사진"
                value={`${analysis.commonAnalysis.photoTotalMin}~${analysis.commonAnalysis.photoTotalMax}장`}
              />
              <Metric
                name="평균 키워드"
                value={
                  analysis.averages.keywordCount == null
                    ? "수집 실패"
                    : `${analysis.averages.keywordCount}회`
                }
              />
            </div>
            <p className="insight">{analysis.insight}</p>

            <h3 className="sectionTitle">상위 7개 글 개별 진단</h3>
            <div className="competitorCards">
              {analysis.competitors.map((x, i) => (
                <article className="competitorCard" key={x.link}>
                  <div className="rank">#{i + 1}</div>
                  <a
                    className="competitorTitle"
                    href={x.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {x.title}
                  </a>
                  <small>
                    {x.bloggerName} · {x.postdate}
                  </small>
                  <div className="miniStats">
                    <span>
                      원고{" "}
                      {x.crawled && x.charCount != null
                        ? `${x.charCount.toLocaleString()}자`
                        : "접근 실패"}
                    </span>
                    <span>
                      사진 {x.crawled ? `${x.imageCount ?? 0}장` : "-"}
                    </span>
                    <span>
                      소제목 {x.crawled ? `${x.headingCount ?? 0}개` : "-"}
                    </span>
                  </div>
                  {x.frequentKeywords?.length ? (
                    <div className="analysisBlock">
                      <b>자주 쓰는 키워드</b>
                      <div className="chips compact">
                        {x.frequentKeywords.map((k) => (
                          <span className="chip" key={k}>
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {x.contentFeatures?.length ? (
                    <div className="analysisBlock">
                      <b>글의 특징</b>
                      <ul>
                        {x.contentFeatures.map((f, idx) => (
                          <li key={idx}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {x.photoFeatures?.length ? (
                    <div className="analysisBlock">
                      <b>사진 구성 특징</b>
                      <ul>
                        {x.photoFeatures.map((f, idx) => (
                          <li key={idx}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {x.authorPerspective ? (
                    <div className="analysisBlock">
                      <b>작가 관점 정보</b>
                      <p>{x.authorPerspective}</p>
                    </div>
                  ) : null}
                  {x.seoStructure?.length ? (
                    <div className="analysisBlock">
                      <b>SEO/구조 특징</b>
                      <ul>
                        {x.seoStructure.map((f, idx) => (
                          <li key={idx}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="confidence">
                    <b>분석 신뢰도</b>
                    <span>{x.confidence ?? (x.crawled ? 60 : 10)}%</span>
                  </div>
                  <div className="review">
                    <b>총평</b>
                    <p>
                      {x.review ||
                        (x.crawled
                          ? "본문 구조 데이터는 수집했지만 AI 총평은 생성되지 않았습니다."
                          : "본문 접근에 실패했습니다.")}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="commonPanel">
              <h3>상위 7개 공통점</h3>
              <div className="commonGrid">
                <div>
                  <b>공통 키워드</b>
                  <div className="chips compact">
                    {analysis.commonAnalysis.commonKeywords.map((k) => (
                      <span className="chip" key={k}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <b>공통 구성</b>
                  <ul>
                    {analysis.commonAnalysis.commonFeatures.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <b>사진 구성 공통점</b>
                  <ul>
                    {analysis.commonAnalysis.photoCommonFeatures.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <b>잘하는 점</b>
                  <ul>
                    {analysis.commonAnalysis.strengths.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <b>벤치마킹해서 가져올 것</b>
                  <ul>
                    {analysis.commonAnalysis.takeaways.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <b>우리가 다르게 할 것</b>
                  <ul>
                    {analysis.commonAnalysis.differentiators.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="overall">
                <b>종합 총평</b>
                <p>{analysis.commonAnalysis.overallReview}</p>
              </div>
            </div>

            <div className="photoPanel">
              <div>
                <h3>추천 사진 구성</h3>
                <p>
                  상위 글 관찰 기반 권장치입니다. 특정 사진 수가 상위노출을
                  보장한다는 의미는 아닙니다.
                </p>
              </div>
              <strong>
                총 {analysis.commonAnalysis.photoTotalMin}~
                {analysis.commonAnalysis.photoTotalMax}장
              </strong>
              <div className="photoPlan">
                {analysis.commonAnalysis.photoPlan.map((p, i) => (
                  <div key={i}>
                    <b>{p.section}</b>
                    <span>
                      {p.min}~{p.max}장
                    </span>
                    <small>{p.note}</small>
                  </div>
                ))}
              </div>
            </div>

            <small className="note">
              ※ 실제 순위는 사용자가 입력한 URL 순서를 기준으로 합니다. 본문과
              대표 이미지 일부를 분석하지만 네이버 페이지 구조/접근 제한에 따라
              일부 데이터가 빠질 수 있어 각 글에 분석 신뢰도를 표시합니다. 검색
              결과 수는 월 검색량이 아닙니다.
            </small>
          </div>
        )}
      </section>

      <section className="card">
        <div className="step">STEP 2</div>
        <h2>AI 추천 키워드 & 작성 전략</h2>
        <p className="helper">
          상위 7개 공통점을 토대로 추천 키워드가 자동 입력됩니다. 필요하면 직접
          수정하거나 삭제하세요.
        </p>
        <div className="keywordRow mainKeywordRow">
          <label>
            <span>메인 키워드</span>
            <input
              value={mainKeyword}
              onChange={(e) => setMainKeyword(e.target.value)}
              placeholder="예: 발라드지디 본식스냅"
            />
          </label>
          <RangeInputs
            min={mainMin}
            max={mainMax}
            onMin={setMainMin}
            onMax={setMainMax}
          />
        </div>
        <div className="keywordSectionTitle">
          <b>AI 추천 + 직접 추가 키워드</b>
          <button className="lightButton" onClick={() => addKeywordTarget()}>
            + 직접 추가
          </button>
        </div>
        {additional.length === 0 && (
          <div className="emptyLine">
            분석 후 AI가 추가 키워드를 자동으로 제안합니다.
          </div>
        )}
        <div className="keywordList">
          {additional.map((item, i) => (
            <div className="keywordRow" key={i}>
              <input
                value={item.keyword}
                onChange={(e) =>
                  updateAdditional(i, { keyword: e.target.value })
                }
                placeholder="추가 키워드"
              />
              <RangeInputs
                min={item.min}
                max={item.max}
                onMin={(v) => updateAdditional(i, { min: v })}
                onMax={(v) => updateAdditional(i, { max: v })}
              />
              <button
                className="removeButton"
                onClick={() =>
                  setAdditional((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <label className="fullLabel">
          <span>
            반드시 포함할 표현 <small>쉼표 또는 줄바꿈으로 구분</small>
          </span>
          <input
            value={requiredText}
            onChange={(e) => setRequiredText(e.target.value)}
            placeholder="예: 메인작가, 본식스냅, 웨딩홀 촬영팁"
          />
        </label>

        <label className="fullLabel strategyLabel">
          <span>
            AI 작성 전략{" "}
            <small>
              상위 7개 공통점과 블로그 목적을 토대로 자동 입력 · 직접 수정 가능
            </small>
          </span>
          <textarea
            value={strategyPrompt}
            onChange={(e) => setStrategyPrompt(e.target.value)}
            placeholder="키워드 분석 후 자동으로 채워집니다."
          />
        </label>
        <div className="planPreview">
          <b>AI 적용 계획</b>
          <span>
            {mainKeyword || "메인 키워드"} {mainMin}~{mainMax}회
          </span>
          {additional
            .filter((x) => x.keyword)
            .map((x, i) => (
              <span key={i}>
                {x.keyword} {x.min}~{x.max}회
              </span>
            ))}
        </div>
      </section>

      <section className="card">
        <div className="step">STEP 3</div>
        <h2>대표 사진 5장 + 작가 메모</h2>
        <p className="helper">
          대표 사진 5장은 AI가 홀 분위기와 장면을 파악하기 위한 분석용입니다.
          실제 포스팅에는 STEP 1의 추천 사진 구성에 맞춰 더 많은 사진을 넣는
          것을 전제로 원고를 작성합니다.
        </p>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 오후 2시 예식. 신부대기실 창가 쪽이 밝았음. 입장 때 조도 변화가 컸음. 플라워샤워 동선이 좋았음. 직접 확인한 내용 위주로 적어주세요."
        />
        <label className="upload">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => addImages(e.target.files)}
          />
          <b>대표 사진 선택</b>
          <span>최대 5장 · 1400px로 축소 후 분석 · 서버 저장 안 함</span>
        </label>
        <div className="thumbs">
          {images.map((src, i) => (
            <div key={i}>
              <img src={src} alt={`사진 ${i + 1}`} />
              <button
                onClick={() => setImages(images.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
        <label className="aiOption">
          <input
            type="checkbox"
            checked={useOpenAI}
            onChange={(e) => setUseOpenAI(e.target.checked)}
          />
          <span>
            <b>ChatGPT도 함께 사용</b>
            <small>
              선택 사항 · OpenAI API 크레딧 필요 · 체크하지 않으면 Gemini만
              사용합니다.
            </small>
          </span>
        </label>
        <button className="generate" onClick={generate} disabled={!canGenerate}>
          {generating
            ? useOpenAI
              ? "Gemini + ChatGPT 생성 중..."
              : "Gemini 원고 생성 중..."
            : useOpenAI
              ? "Gemini + ChatGPT로 원고 생성"
              : "Gemini로 원고 생성"}
        </button>
        {error && (
          <div className="error stepError">
            <b>원고 생성 오류</b>
            <div>{error}</div>
          </div>
        )}
        {openaiNotice && (
          <div className="warning stepError">
            <b>ChatGPT 안내</b>
            <div>{openaiNotice}</div>
          </div>
        )}
        {analysis && (
          <small className="note strongNote">
            AI에는 추천 본문 <b>{analysis.recommendedLength}</b>, 추천 사진{" "}
            <b>
              {analysis.commonAnalysis.photoTotalMin}~
              {analysis.commonAnalysis.photoTotalMax}장
            </b>
            , 상위 7개 공통점, 키워드 목표와 메인작가 페르소나가 함께
            전달됩니다.
          </small>
        )}
      </section>

      {drafts && (
        <section className="results">
          <Draft
            title={useOpenAI && drafts.gpt ? "통합 추천본" : "Gemini 추천본"}
            text={drafts.merged}
            primary
            plan={plan}
          />
          {useOpenAI && drafts.gpt && (
            <Draft title="Gemini 버전" text={drafts.gemini} plan={plan} />
          )}
          {useOpenAI && drafts.gpt && (
            <Draft title="ChatGPT 버전" text={drafts.gpt} plan={plan} />
          )}
        </section>
      )}

      <footer>
        레몬과 깔라만씨의 · 내부 운영용 MVP · 자동발행/사진저장 없음 · API별
        일일 호출 제한 적용
      </footer>
    </main>
  );
}

function Metric({ name, value }: { name: string; value: string }) {
  return (
    <div className="metric">
      <span>{name}</span>
      <b>{value}</b>
    </div>
  );
}
function Usage({
  name,
  item,
}: {
  name: string;
  item: { used: number; limit: number; remaining: number };
}) {
  return (
    <div className="usageItem">
      <b>{name}</b>
      <span>
        {item.used}/{item.limit}
      </span>
      <small>남음 {item.remaining}</small>
    </div>
  );
}
function RangeInputs({
  min,
  max,
  onMin,
  onMax,
}: {
  min: number;
  max: number;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
}) {
  return (
    <div className="rangeInputs">
      <span>목표</span>
      <input
        type="number"
        min={0}
        max={30}
        value={min}
        onChange={(e) => onMin(Math.max(0, Number(e.target.value) || 0))}
      />
      <em>~</em>
      <input
        type="number"
        min={0}
        max={30}
        value={max}
        onChange={(e) => onMax(Math.max(0, Number(e.target.value) || 0))}
      />
      <span>회</span>
    </div>
  );
}
function Draft({
  title,
  text,
  primary = false,
  plan,
}: {
  title: string;
  text: string;
  primary?: boolean;
  plan: KeywordPlan;
}) {
  const rows = [plan.main, ...plan.additional]
    .filter((x) => x.keyword.trim())
    .map((x) => ({ ...x, actual: countKeyword(text, x.keyword) }));
  return (
    <article className={`card draft ${primary ? "primary" : ""}`}>
      <div className="draftHead">
        <h2>{title}</h2>
        <button onClick={() => navigator.clipboard.writeText(text)}>
          복사
        </button>
      </div>
      <div className="keywordAudit">
        <b>키워드 검수</b>
        {rows.map((x, i) => {
          const ok = x.actual >= x.min && x.actual <= x.max;
          return (
            <span className={ok ? "ok" : "warn"} key={i}>
              {x.keyword} <strong>{x.actual}회</strong> / 목표 {x.min}~{x.max}{" "}
              {ok ? "✓" : "⚠"}
            </span>
          );
        })}
      </div>
      <pre>{text}</pre>
    </article>
  );
}
