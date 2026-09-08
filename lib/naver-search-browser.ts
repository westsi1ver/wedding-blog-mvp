import { chromium } from "playwright";

export type NaverSearchPost = {
  rank: number;
  title: string;
  url: string;
};

function normalizeBlogUrl(raw: string) {
  try {
    const u = new URL(raw);

    // Some Naver result links wrap the destination in a query parameter.
    for (const key of ["u", "url", "target"]) {
      const value = u.searchParams.get(key);
      if (value) {
        const decoded = decodeURIComponent(value);
        if (/^https?:\/\/(m\.)?blog\.naver\.com\//i.test(decoded)) return normalizeBlogUrl(decoded);
      }
    }

    if (!/(^|\.)blog\.naver\.com$/i.test(u.hostname)) return "";

    u.hostname = "blog.naver.com";
    u.hash = "";

    // Keep only links that look like an actual post, not a blog home/profile.
    const parts = u.pathname.split("/").filter(Boolean);
    const logNo = u.searchParams.get("logNo");
    if (logNo) return `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(u.searchParams.get("blogId") || "")}&logNo=${encodeURIComponent(logNo)}`;
    if (parts.length >= 2 && /^\d{5,}$/.test(parts[1])) return `https://blog.naver.com/${parts[0]}/${parts[1]}`;
    return "";
  } catch {
    return "";
  }
}

export async function discoverActualNaverTopPosts(keyword: string, limit = 7): Promise<NaverSearchPost[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      viewport: { width: 430, height: 932 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
      },
    });

    const page = await context.newPage();
    const searchUrl = `https://m.search.naver.com/search.naver?where=m&query=${encodeURIComponent(keyword)}`;

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Give dynamically inserted unified-search cards a chance to appear.
    await page.waitForTimeout(1200);

    const found = new Map<string, { title: string; url: string }>();

    for (let pass = 0; pass < 5 && found.size < limit; pass++) {
      const anchors = await page.locator("a").evaluateAll((nodes) =>
        nodes.map((node) => {
          const a = node as HTMLAnchorElement;
          return {
            href: a.href || a.getAttribute("href") || "",
            text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(),
            aria: a.getAttribute("aria-label") || "",
          };
        })
      );

      for (const a of anchors) {
        const url = normalizeBlogUrl(a.href);
        if (!url || found.has(url)) continue;

        // Search title links are usually descriptive. Skip empty/profile-like anchors.
        const title = (a.text || a.aria || "네이버 블로그 글").trim();
        if (title.length < 4) continue;
        if (/^(블로그|프로필|더보기|공유|이미지)$/i.test(title)) continue;

        found.set(url, { title, url });
        if (found.size >= limit) break;
      }

      if (found.size < limit) {
        await page.mouse.wheel(0, 1800);
        await page.waitForTimeout(700);
      }
    }

    const items = [...found.values()].slice(0, limit).map((item, index) => ({
      rank: index + 1,
      ...item,
    }));

    if (!items.length) {
      const pageTitle = await page.title().catch(() => "");
      throw new Error(
        `실제 네이버 검색 화면에서 블로그 글 URL을 찾지 못했습니다.${pageTitle ? ` (페이지: ${pageTitle})` : ""} 네이버가 자동 브라우저 접근을 제한했거나 검색 화면 구조가 변경됐을 수 있습니다.`
      );
    }

    return items;
  } finally {
    await browser.close();
  }
}
