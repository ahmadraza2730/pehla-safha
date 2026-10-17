import calendar
import os
import re
from datetime import datetime, timezone

import feedparser
import psycopg
from dotenv import load_dotenv

load_dotenv()

FEEDS = {
    "BBC News": "https://feeds.bbci.co.uk/news/rss.xml",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
    "Dawn": "https://www.dawn.com/feeds/home",
    "Express Tribune": "https://tribune.com.pk/feed/home",
    "TechCrunch": "https://techcrunch.com/feed/",
    "The Guardian": "https://www.theguardian.com/world/rss",
}


def clean(text, limit=500):
    text = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", text).strip()[:limit]


def get_image(entry):
    for key in ("media_content", "media_thumbnail"):
        items = entry.get(key)
        if items and items[0].get("url"):
            return items[0]["url"]
    for enc in entry.get("enclosures", []):
        if enc.get("type", "").startswith("image"):
            return enc.get("href")
    return None


def get_date(entry):
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        return datetime.fromtimestamp(calendar.timegm(parsed), tz=timezone.utc)
    return datetime.now(timezone.utc)


def run():
    total_new = 0
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        for source, url in FEEDS.items():
            feed = feedparser.parse(url, agent="PehlaSafha/0.1")
            new = 0
            for e in feed.entries:
                link, title = e.get("link"), clean(e.get("title"), 300)
                if not link or not title:
                    continue
                cur = conn.execute(
                    """insert into articles
                       (url, title, source, published_at, image_url, summary)
                       values (%s, %s, %s, %s, %s, %s)
                       on conflict (url) do nothing""",
                    (link, title, source, get_date(e), get_image(e),
                     clean(e.get("summary"))),
                )
                new += cur.rowcount
            print(f"{source}: {len(feed.entries)} fetched, {new} new")
            total_new += new
    print(f"Done. {total_new} new articles.")


if __name__ == "__main__":
    run()