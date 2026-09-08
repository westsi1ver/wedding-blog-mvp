import * as cheerio from "cheerio";
import { consumeApiCall } from "./daily-limit";
import { analyzeCompetitorsWithGemini } from "./competitor-ai";
import type { CompetitorItem, KeywordAnalysis } from "./types";

const NAVER_API_HUB_BASE = "https://naverapihub.apigw.ntruss.com";
const clean = (s: string) => s.replace(/<[^>]*>/g," ").replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();

async function searchNaverBlog(keyword: string) {
  const id = process.env.NAVER_API_HUB_CLIENT_ID;
  const secret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  if (!id || !secret) return { total: 0, items: [] };
  await consumeApiCall("naver");
  const url = new URL(`${NAVER_API_HUB_BASE}/search/v1/blog`);
  url.searchParams.set("query", keyword); url.searchParams.set("display", "10"); url.searchParams.set("start", "1"); url.searchParams.set("sort", "sim"); url.searchParams.set("format", "json");
  const res = await fetch(url,{headers:{"X-NCP-APIGW-API-KEY-ID":id,"X-NCP-APIGW-API-KEY":secret},cache:"no-store"});
  if (!res.ok) return { total: 0, items: [] };
  return res.json() as Promise<any>;
}

function mobileBlogUrl(link: string) {
  try { const u = new URL(link); if (u.hostname === "blog.naver.com" || u.hostname === "www.blog.naver.com") { u.hostname="m.blog.naver.com"; return u.toString(); } } catch {}
  return link;
}

function absoluteImageUrl(src: string, base: string) {
  try { return new URL(src, base).toString(); } catch { return ""; }
}

async function crawlUrl(link: string, keyword: string, rank: number): Promise<CompetitorItem> {
  const base: CompetitorItem = { title:`${rank}위 글`, link, bloggerName:"", postdate:"", description:"" };
  try {
    const targetUrl = mobileBlogUrl(link);
    const res = await fetch(targetUrl,{headers:{"User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1","Accept-Language":"ko-KR,ko;q=0.9"},redirect:"follow",signal:AbortSignal.timeout(15000),cache:"no-store"});
    if (!res.ok) return {...base,crawled:false,confidence:15};
    const html = await res.text(); const $ = cheerio.load(html);
    const title = clean($("meta[property='og:title']").attr("content") || $("title").text() || base.title);
    const bloggerName = clean($("meta[property='naverblog:nickname']").attr("content") || $(".nick").first().text() || "");
    $("script,style,noscript,svg,nav,header,footer").remove();
    const selectors=[".se-main-container",".se_component_wrap",".post_ct",".post-view","#postViewArea",".se_doc_viewer","article"];
    let root=$("body"); for(const s of selectors){if($(s).length){root=$(s).first();break;}}
    const text=clean(root.text()); if(text.length<120) return {...base,title,bloggerName,crawled:false,confidence:25};
    const paragraphs=root.find("p,.se-text-paragraph").filter((_,el)=>clean($(el).text()).length>10).length;
    const headings=root.find("h1,h2,h3,h4,.se-section-title,.se-title-text,.se-module-text h2,.se-module-text h3").length;
    const imageKeys=new Set<string>();
    root.find("img,.se-image-resource").each((i,el)=>{const raw=$(el).attr("data-lazy-src")||$(el).attr("data-src")||$(el).attr("src")||""; const src=absoluteImageUrl(raw,targetUrl); if(src&&!/icon|emoji|profile|logo|banner|sticker|staticmap/i.test(src)) imageKeys.add(src);});
    const normalizedKeyword=keyword.replace(/\s+/g,""); const normalizedText=text.replace(/\s+/g,"");
    const keywordCount=normalizedKeyword?normalizedText.split(normalizedKeyword).length-1:0;
    let confidence=55; if(text.length>800)confidence+=15; if(imageKeys.size>3)confidence+=10; if(paragraphs>3)confidence+=10; if(title)confidence+=5;
    return {...base,title,bloggerName,charCount:text.length,paragraphCount:paragraphs,headingCount:headings,imageCount:imageKeys.size,keywordCount,rawText:text,imageUrls:[...imageKeys].slice(0,8),crawled:true,confidence:Math.min(95,confidence)};
  } catch(e){console.error("[NAVER MANUAL CRAWL FAIL]",link,e);return {...base,crawled:false,confidence:10};}
}

function avg(nums:number[]){return nums.length?Math.round(nums.reduce((a,b)=>a+b,0)/nums.length):null;}
function median(nums:number[]){if(!nums.length)return null;const s=[...nums].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);}

function strategyPrompt(a: KeywordAnalysis["commonAnalysis"], low:number, high:number){
 const keywords=a.suggestedKeywords.map(k=>`${k.keyword} ${k.min}~${k.max}회`).join(", ")||"없음";
 const photos=a.photoPlan.map(p=>`${p.section}: ${p.min}~${p.max}장 (${p.note})`).join("\n");
 return `블로그 목적:\n- 고객 상담 시 원하는 식장/홀의 실제 레퍼런스 사진을 인스타그램보다 많이 보여주고 포스팅 링크 하나로 제공한다.\n- 메인작가가 실제 촬영 경험을 바탕으로 홀 투어에서 얻기 어려운 조명, 동선, 사진 결과물, 촬영 포인트를 제공한다.\n\n작성자 페르소나:\n- 실제 본식을 촬영하는 현직 웨딩스냅 메인작가.\n- 고객/신부인 척 후기 쓰지 않는다.\n- 작가 메모와 사진으로 확인되는 경험만 실제 경험처럼 표현한다.\n- 판매문구보다 레퍼런스와 현장 정보가 우선이다.\n\n실제 네이버 상위 7개 공통점:\n${a.commonFeatures.map(x=>`- ${x}`).join("\n")}\n\n사진 구성 공통점:\n${a.photoCommonFeatures.map(x=>`- ${x}`).join("\n")}\n\n벤치마킹해서 가져올 것:\n${a.takeaways.map(x=>`- ${x}`).join("\n")}\n\n우리가 다르게 할 것:\n${a.differentiators.map(x=>`- ${x}`).join("\n")}\n\n콘텐츠 전략:\n${a.contentStrategy}\n\n추천 본문 분량: ${low.toLocaleString()}~${high.toLocaleString()}자\n상위 글 관찰 기반 추천 사진 수: ${a.photoTotalMin}~${a.photoTotalMax}장\n추천 사진 배치:\n${photos}\n\nAI 추천 추가 키워드: ${keywords}`;
}

export async function analyzeKeyword(keyword:string, competitorUrls:string[]=[]):Promise<KeywordAnalysis>{
  const urls=competitorUrls.map(x=>x.trim()).filter(Boolean).slice(0,7);
  const raw=await searchNaverBlog(keyword);
  let competitors:CompetitorItem[]=[];
  if(urls.length){ competitors=await Promise.all(urls.map((u,i)=>crawlUrl(u,keyword,i+1))); }
  else { const apiItems=(raw.items||[]).slice(0,7); competitors=await Promise.all(apiItems.map((it:any,i:number)=>crawlUrl(it.link,keyword,i+1))); }
  const crawled=competitors.filter(x=>x.crawled);
  const chars=crawled.map(x=>x.charCount).filter((v):v is number=>typeof v==="number");
  const paragraphs=crawled.map(x=>x.paragraphCount).filter((v):v is number=>typeof v==="number");
  const headings=crawled.map(x=>x.headingCount).filter((v):v is number=>typeof v==="number");
  const images=crawled.map(x=>x.imageCount).filter((v):v is number=>typeof v==="number");
  const keywordCounts=crawled.map(x=>x.keywordCount).filter((v):v is number=>typeof v==="number");
  const charCount=avg(chars), total=Number(raw.total||0); const competition:KeywordAnalysis["competition"]=total>50000?"높음":total>5000?"중간":"낮음";
  const low=charCount?Math.max(1200,Math.round((charCount*.9)/100)*100):1800; const high=charCount?Math.max(low+300,Math.round((charCount*1.15)/100)*100):2600;
  const commonAnalysis=await analyzeCompetitorsWithGemini(competitors,keyword);
  const parts=keyword.split(/\s+/).filter(Boolean),seed=parts[0]||keyword;
  const relatedKeywords=Array.from(new Set([...commonAnalysis.suggestedKeywords.map(x=>x.keyword),keyword,`${seed} 본식스냅`,`${seed} 웨딩스냅`,`${seed} 신부대기실`,`${seed} 웨딩홀`].filter(Boolean))).slice(0,10);
  const publicCompetitors=competitors.map(({rawText,imageUrls,...rest})=>rest);
  const result:KeywordAnalysis={keyword,totalResults:total,relatedKeywords,competition,recommendedLength:`${low.toLocaleString()}~${high.toLocaleString()}자`,recommendedLengthMin:low,recommendedLengthMax:high,crawlSuccessCount:crawled.length,crawlTargetCount:competitors.length,sourceMode:urls.length?"manual-ranking":"api-reference",averages:{charCount,paragraphCount:avg(paragraphs),headingCount:avg(headings),imageCount:avg(images),keywordCount:avg(keywordCounts)},medianCharCount:median(chars),minCharCount:chars.length?Math.min(...chars):null,maxCharCount:chars.length?Math.max(...chars):null,competitors:publicCompetitors,commonAnalysis,strategyPrompt:"",insight:urls.length?`사용자가 실제 네이버 검색에서 확인한 상위 ${urls.length}개 URL을 기준으로 ${crawled.length}개 본문을 수집해 심층 분석했습니다.`:`API 참고 결과 ${competitors.length}개 중 ${crawled.length}개 본문을 분석했습니다. 실제 순위 벤치마킹에는 URL 직접 입력을 권장합니다.`};
  result.strategyPrompt=strategyPrompt(commonAnalysis,low,high); return result;
}
