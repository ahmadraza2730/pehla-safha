import hashlib
import os
import re
import time
from datetime import datetime, timezone

import feedparser
import psycopg
import trafilatura
from dotenv import load_dotenv

from ingest.sources import FEEDS

load_dotenv()


def sha(text):
	return hashlib.sha256(text.encode("utf-8")).hexdigest()


def clean_url(url):
	return url.split("?")[0].rstrip("/")


def norm_title(title):
	return re.sub(r"[^a-z0-9 ]", "", title.lower()).strip()


def parse_date(entry):
	t = entry.get("published_parsed") or entry.get("updated_parsed")
	if not t:
		return None
	return datetime.fromtimestamp(time.mktime(t), tz=timezone.utc)


def good_image(url):
	if not url or not isinstance(url, str):
		return None
	url = url.strip()
	return url if url.startswith("http") else None


def feed_image(entry):
	for key in ("media_content", "media_thumbnail"):
		for item in entry.get(key) or []:
			url = good_image(item.get("url"))
			if url:
				return url
	for link in entry.get("links") or []:
		if str(link.get("type", "")).startswith("image"):
			url = good_image(link.get("href"))
			if url:
				return url
	return None


def fetch_page(url):
	"""Returns (text, og_image) for an article page."""
	try:
		html = trafilatura.fetch_url(url)
		if not html:
			return None, None
		content = trafilatura.extract(html, include_comments=False)
		meta = trafilatura.extract_metadata(html)
		image = good_image(meta.image) if meta else None
		return content, image
	except Exception:
		return None, None


def run():
	fetched = new = dupes = failed = 0

	with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
		for source, topic, feed_url in FEEDS:
			try:
				feed = feedparser.parse(feed_url)
			except Exception as ex:
				print(f"{source}: feed failed ({ex})")
				continue

			feed_new = 0
			for e in feed.entries:
				fetched += 1
				url = e.get("link")
				title = e.get("title")
				if not url or not title:
					continue

				url_hash = sha(clean_url(url))
				title_hash = sha(norm_title(title))

				try:
					with conn.cursor() as cur:
						cur.execute(
							"""select 1 from articles
							where url = %s or url_hash = %s or title_hash = %s
							limit 1""",
							(url, url_hash, title_hash),
						)
						if cur.fetchone():
							dupes += 1
							continue

						cur.execute(
							"""insert into articles
							(url, url_hash, title, title_hash, source, topic,
							 published_at, summary, content, image_url)
							values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
							on conflict do nothing""",
							(url, url_hash, title, title_hash, source, topic,
							 parse_date(e), e.get("summary"), None, feed_image(e)),
						)
						if cur.rowcount == 0:
							dupes += 1
							continue

						content, page_image = fetch_page(url)
						cur.execute(
							"""update articles
							set content = coalesce(%s, content),
							    image_url = coalesce(image_url, %s)
							where url_hash = %s""",
							(content, page_image, url_hash),
						)
						new += 1
						feed_new += 1
				except Exception as ex:
					failed += 1
					print(f"  skipped one article from {source}: {ex}")

			print(f"{source}: {feed_new} new")

	print(f"fetched {fetched}, new {new}, dupes {dupes}, failed {failed}")
	return {"fetched": fetched, "new": new, "dupes": dupes, "failed": failed}


if __name__ == "__main__":
	run()