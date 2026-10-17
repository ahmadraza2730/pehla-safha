import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import feedparser

from ingest.run import fetch_page, good_image, parse_date

AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PehlaSafha/1.0"


def strip_html(text):
	text = re.sub(r"<[^>]+>", " ", text or "")
	return re.sub(r"\s+", " ", text).strip()


def real_url(link):
	# Bing wraps the real article address in a "url" parameter.
	query = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
	if "url" in query:
		return query["url"][0]
	return link


def domain(url):
	host = urllib.parse.urlparse(url).netloc.lower()
	return host[4:] if host.startswith("www.") else host


def search_live(q, limit=12):
	feed_url = "https://www.bing.com/news/search?format=rss&q=" + urllib.parse.quote(q)
	feed = feedparser.parse(feed_url, agent=AGENT)

	items = []
	for e in feed.entries[:limit]:
		url = real_url(e.get("link", ""))
		title = (e.get("title") or "").strip()
		if not url.startswith("http") or not title:
			continue
		source = e.get("news_source") or (e.get("source") or {}).get("title") or domain(url)
		items.append({
			"url": url,
			"title": title,
			"summary": strip_html(e.get("summary"))[:300],
			"source": source,
			"published_at": parse_date(e),
			"image": good_image(e.get("news_image")),
		})

	with ThreadPoolExecutor(max_workers=6) as pool:
		pages = list(pool.map(lambda it: fetch_page(it["url"]), items))

	for it, (content, page_image) in zip(items, pages):
		it["content"] = content
		it["image"] = it["image"] or page_image

	return [it for it in items if it["content"] or it["summary"]]