import json
import os
import re
import sys
import time
import psycopg
from dotenv import load_dotenv
from fastembed import TextEmbedding
from google import genai
from google.genai import errors, types

load_dotenv()

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GROUP = int(os.getenv("ENRICH_GROUP", "10"))
DELAY = float(os.getenv("GEMINI_DELAY", "4"))
TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 40

TOPICS = [
    "Politics", "World", "Business", "Technology", "AI", "Science", "Health",
    "Sports", "Cricket", "Entertainment", "Pakistan", "Education",
    "Environment", "Gaming", "Culture", "Opinion",
]

SYSTEM = (
    "You tag news articles. You receive a numbered list. Return ONLY a JSON array "
    "with one object per article, in this exact shape: "
    '{"n": <article number>, "topics": [1-3 items chosen ONLY from: ' + ", ".join(TOPICS) + "], "
    '"summary": "max 35 words, neutral, in your own words", "tone": "neutral|opinion|alarming", '
    '"reading_time_min": integer between 1 and 10}'
)

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
embedder = TextEmbedding("BAAI/bge-small-en-v1.5")  # 384 dimensions
CONFIG = types.GenerateContentConfig(
    system_instruction=SYSTEM,
    response_mime_type="application/json",
    temperature=0.2,
)

class QuotaExhausted(Exception):
    """Raised when the API keeps answering 429 (rate limit or daily quota)."""

def parse_json(text):
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"(\[.*\]|\{.*\})", text, re.S)
        if not match:
            raise
        data = json.loads(match.group(1))
    if isinstance(data, dict):
        data = data.get("results") or data.get("articles") or [data]
    return data

def call_model(prompt, config=None, retries=2):
    """Call Gemini. Retries briefly on server errors and rate limits, then gives up."""
    for attempt in range(retries + 1):
        try:
            return client.models.generate_content(
                model=MODEL, contents=prompt, config=config
            )
        except errors.APIError as e:
            if e.code == 429:
                if attempt < retries:
                    wait = 20 * (attempt + 1)
                    print(f"    (rate limited, waiting {wait}s...)")
                    time.sleep(wait)
                    continue
                raise QuotaExhausted(e.message)
            if e.code in (500, 503) and attempt < retries:
                time.sleep(3 * (attempt + 1))
                continue
            raise

def clean_item(item):
    topics = [t for t in item.get("topics", []) if t in TOPICS][:3]
    tone = item.get("tone")
    try:
        minutes = int(item.get("reading_time_min", 3))
    except (TypeError, ValueError):
        minutes = 3
    return {
        "topics": topics or ["World"],
        "summary": str(item.get("summary", "")).strip()[:300],
        "tone": tone if tone in ("neutral", "opinion", "alarming") else "neutral",
        "reading_time_min": max(1, min(minutes, 10)),
    }

def vec_literal(vector):
    return "[" + ",".join(f"{float(x):.6f}" for x in vector) + "]"

def preflight():
    """One quick call with no retries, so problems show up immediately."""
    try:
        client.models.generate_content(model=MODEL, contents="Reply with: ok")
        print(f"API check passed (model: {MODEL})")
        return True
    except errors.APIError as e:
        print(f"API check FAILED (model: {MODEL})")
        print(f"  status: {e.code}")
        print(f"  reason: {e.message}")
        if e.code == 429:
            print("  -> Quota or rate limit reached. Wait a few minutes (or until "
                  "tomorrow if it is the daily limit), then run again.")
        elif e.code == 404:
            print("  -> Model name rejected. Pick a current model in Google AI "
                  "Studio and set GEMINI_MODEL in api/.env.")
        elif e.code in (400, 401, 403):
            print("  -> Check GEMINI_API_KEY in api/.env.")
        return False
    except Exception as e:
        print(f"API check FAILED: {type(e).__name__}: {e}")
        return False

def process_group(conn, group):
    """Enrich up to GROUP articles with one Gemini call and one embedding pass."""
    lines = [
        f"{i}. Title: {title}\n   Snippet: {(snippet or '(none)')[:300]}"
        for i, (_, title, snippet) in enumerate(group, start=1)
    ]
    response = call_model("\n\n".join(lines), CONFIG)
    
    # FIX: Check if response is None or missing text attribute to satisfy Pylance
    if not response or not hasattr(response, 'text') or not response.text:
        raise ValueError("Model returned an empty response")
        
    items = {int(it.get("n", 0)): it for it in parse_json(response.text)}
    
    cleaned = []
    for i, (art_id, title, _) in enumerate(group, start=1):
        if i in items:
            cleaned.append((art_id, title, clean_item(items[i])))
            
    if not cleaned:
        raise ValueError("model returned no usable items")
        
    texts = [f"{title}. {d['summary']}" for _, title, d in cleaned]
    vectors = list(embedder.embed(texts))
    
    for (art_id, title, d), vector in zip(cleaned, vectors):
        conn.execute(
            """update articles
               set topics = %s, summary = %s, tone = %s,
                   reading_time_min = %s, embedding = %s::vector
               where id = %s""",
            (d["topics"], d["summary"], d["tone"],
             d["reading_time_min"], vec_literal(vector), art_id),
        )
        print(f"  ok: {title[:60]} -> {d['topics']}")
        
    conn.commit()
    return len(cleaned)

def run():
    if not preflight():
        sys.exit(1)
        
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        rows = conn.execute(
            """select id, title, coalesce(summary, '')
               from articles
               where topics is null
               order by published_at desc
               limit %s""",
            (TOTAL,),
        ).fetchall()
        
        if not rows:
            print("Nothing to enrich. Run ingest/rss.py to fetch new articles.")
            return
            
        print(f"Enriching {len(rows)} articles in groups of {GROUP}...")
        done = failed = 0
        started = time.time()
        try:
            for start in range(0, len(rows), GROUP):
                group = rows[start:start + GROUP]
                try:
                    done += process_group(conn, group)
                except QuotaExhausted as e:
                    conn.rollback()
                    print(f"\nStopped: API quota or rate limit reached. {e}")
                    print("Progress so far is saved. Run again later.")
                    break
                except Exception as e:
                    conn.rollback()
                    failed += len(group)
                    print(f"  group failed ({type(e).__name__}): {e}")
                    
                print(f"  progress: {min(start + GROUP, len(rows))}/{len(rows)} "
                      f"({time.time() - started:.0f}s)")
                time.sleep(DELAY)
        except KeyboardInterrupt:
            conn.rollback()
            print("\nInterrupted. Finished groups are already saved.")
            
        print(f"Done. {done} enriched, {failed} failed "
              f"in {time.time() - started:.0f}s.")

if __name__ == "__main__":
    run()