import { chromium } from "playwright";

const keyword = process.argv.slice(2).join(" ") || "서울웨딩타워 스냅";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 430, height: 932 },
    locale: "ko-KR",
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  });
  const url = `https://m.search.naver.com/search.naver?where=m&query=${encodeURIComponent(keyword)}`;
  console.log("OPEN", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  console.log("TITLE", await page.title());
  console.log("BLOG LINKS");
  const links = await page.locator('a[href*="blog.naver.com"]').evaluateAll((nodes) =>
    nodes.slice(0, 30).map((n) => ({
      text: ((n.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 100),
      href: n.href,
    }))
  );
  console.table(links);
} finally {
  await browser.close();
}
