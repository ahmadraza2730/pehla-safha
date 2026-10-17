import json
import math
import os
import secrets
import threading
import uuid
from datetime import date, datetime, timezone

import psycopg
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastembed import TextEmbedding
from pydantic import BaseModel

from export.pdf import render_pdf
from ingest.run import clean_url, fetch_page, norm_title, sha
from ingest.run import run as run_ingest
from live import search_live

load_dotenv()

app = FastAPI(title="Pehla Safha API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

embedder = TextEmbedding("BAAI/bge-small-en-v1.5")  # 384 dimensions


def db():
    return psycopg.connect(os.environ["DATABASE_URL"])


def vec_literal(vector):
    return "[" + ",".join(f"{float(x):.6f}" for x in vector) + "]"


def require_user(conn, user_id):
    try:
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(404, "Unknown user")
    if not conn.execute("select 1 from users where id = %s", (user_id,)).fetchone():
        raise HTTPException(404, "Unknown user")


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------
# Onboarding and login
# ---------------------------------------------------------------

class Onboarding(BaseModel):
    email: str
    name: str = "Reader"
    topics: list[str]
    about: str = ""


@app.post("/onboarding")
def onboarding(body: Onboarding):
    if not body.topics:
        raise HTTPException(400, "Pick at least one topic")
    text = "Interested in " + ", ".join(body.topics) + ". " + body.about
    vector = next(iter(embedder.embed([text])))
    weights = {t: 1.0 for t in body.topics}
    with db() as conn:
        row = conn.execute(
            """insert into users (email, name, interest_vector, topic_weights)
               values (%s, %s, %s::vector, %s::jsonb)
               on conflict (email) do update
               set name = excluded.name,
                   interest_vector = excluded.interest_vector,
                   topic_weights = excluded.topic_weights
               returning id""",
            (body.email, body.name, vec_literal(vector), json.dumps(weights)),
        ).fetchone()

        if not row:
            raise HTTPException(500, "Failed to insert or update user")

    return {"user_id": str(row[0])}


class Login(BaseModel):
    email: str


@app.post("/login")
def login(body: Login):
    with db() as conn:
        row = conn.execute(
            "select id, name from users where lower(email) = lower(%s)",
            (body.email.strip(),),
        ).fetchone()
    if not row:
        raise HTTPException(404, "No account with that email. Join first.")
    return {"user_id": str(row[0]), "name": row[1]}


# ---------------------------------------------------------------
# Today's edition
# ---------------------------------------------------------------

def article_dict(r, score):
    return {
        "id": str(r[0]), "title": r[1], "source": r[2], "url": r[3],
        "image_url": r[4], "summary": r[5], "topics": r[6] or [],
        "published_at": r[7].isoformat(), "score": round(score, 3),
    }


@app.get("/edition/today")
def edition_today(user_id: str):
    with db() as conn:
        user = conn.execute(
            "select name, topic_weights, interest_vector is not null from users where id = %s",
            (user_id,),
        ).fetchone()

        if not user:
            raise HTTPException(404, "Unknown user")

        name, weights, has_vector = user
        if not has_vector:
            raise HTTPException(400, "Finish onboarding first")

        safe_weights: dict = weights if isinstance(weights, dict) else {}

        rows = conn.execute(
            """select id, title, source, url, image_url, summary, topics, published_at,
                      1 - (embedding <=> (select interest_vector from users where id = %s)) as sim
               from articles
               where embedding is not null
                 and published_at > now() - interval '3 days'
               order by published_at desc
               limit 400""",
            (user_id,),
        ).fetchall()

        if not rows:
            raise HTTPException(404, "No enriched articles yet. Run ingest and enrich first.")

        now = datetime.now(timezone.utc)

        def score(r):
            hours = max((now - r[7]).total_seconds() / 3600, 0)
            recency = math.exp(-hours / 24)
            topic_match = min(1.0, sum(safe_weights.get(t, 0) for t in (r[6] or [])))
            return 0.55 * float(r[8]) + 0.25 * recency + 0.20 * topic_match

        scored = sorted(((score(r), r) for r in rows), key=lambda x: -x[0])
        used = set()

        lead_s, lead_r = scored[0]
        used.add(lead_r[0])

        sections = []
        for topic in sorted(safe_weights.keys(), key=lambda k: float(safe_weights.get(k, 0)), reverse=True)[:4]:
            items = []
            for s, r in scored:
                if r[0] in used or topic not in (r[6] or []):
                    continue
                items.append(article_dict(r, s))
                used.add(r[0])
                if len(items) == 4:
                    break
            if items:
                sections.append({"title": topic, "articles": items})

        more = []
        for s, r in scored:
            if r[0] in used:
                continue
            more.append(article_dict(r, s))
            used.add(r[0])
            if len(more) == 6:
                break

        count_row = conn.execute(
            "select count(*) from editions where user_id = %s and edition_date < %s",
            (user_id, date.today()),
        ).fetchone()
        count = count_row[0] if count_row else 0

        edition = {
            "title": f"The {name} Edition",
            "date": date.today().isoformat(),
            "edition_no": count + 1,
            "lead": article_dict(lead_r, lead_s),
            "sections": sections,
            "more": more,
        }

        conn.execute(
            """insert into editions (user_id, edition_date, edition_no, content)
               values (%s, %s, %s, %s::jsonb)
               on conflict (user_id, edition_date)
               do update set content = excluded.content,
                             edition_no = excluded.edition_no""",
            (user_id, date.today(), edition["edition_no"], json.dumps(edition)),
        )

    return edition


# ---------------------------------------------------------------
# Archive
# ---------------------------------------------------------------

@app.get("/editions")
def list_editions(user_id: str):
    with db() as conn:
        rows = conn.execute(
            """select edition_date, edition_no,
                      content->>'title', content->'lead'->>'title'
               from editions
               where user_id = %s
               order by edition_date desc
               limit 60""",
            (user_id,),
        ).fetchall()
    return [
        {
            "date": r[0].isoformat(),
            "edition_no": r[1],
            "title": r[2],
            "lead_title": r[3],
        }
        for r in rows
    ]


@app.get("/edition/by-date/{day}")
def edition_by_date(day: str, user_id: str):
    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date, use YYYY-MM-DD")
    with db() as conn:
        row = conn.execute(
            "select content from editions where user_id = %s and edition_date = %s",
            (user_id, d),
        ).fetchone()
    if not row:
        raise HTTPException(404, "No paper for that date")
    return row[0]


@app.get("/history")
def history(user_id: str):
    with db() as conn:
        require_user(conn, user_id)
        rows = conn.execute(
            """select a.id, a.title, a.source, a.image_url, a.summary,
                      a.published_at, v.viewed_at, v.view_count
               from article_views v
               join articles a on a.id = v.article_id
               where v.user_id = %s
               order by v.viewed_at desc
               limit 50""",
            (user_id,),
        ).fetchall()
    return [
        {
            "id": str(r[0]), "title": r[1], "source": r[2], "image_url": r[3],
            "summary": r[4],
            "published_at": r[5].isoformat() if r[5] else None,
            "viewed_at": r[6].isoformat(), "view_count": r[7],
        }
        for r in rows
    ]


# ---------------------------------------------------------------
# Full story reader and coverage comparison
# ---------------------------------------------------------------

@app.get("/article/{article_id}")
def get_article(article_id: str, user_id: str):
    try:
        uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(404, "Story not found")

    with db() as conn:
        require_user(conn, user_id)
        row = conn.execute(
            """select id, title, source, url, image_url, summary, content,
                      topics, published_at
               from articles where id = %s""",
            (article_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Story not found")

        content = row[6]
        if not content:
            content, _ = fetch_page(row[3])
            if content:
                conn.execute(
                    "update articles set content = %s where id = %s",
                    (content, article_id),
                )

        conn.execute(
            """insert into article_views (user_id, article_id)
               values (%s, %s)
               on conflict (user_id, article_id) do update
               set viewed_at = now(), view_count = article_views.view_count + 1""",
            (user_id, article_id),
        )

    return {
        "id": str(row[0]), "title": row[1], "source": row[2], "url": row[3],
        "image_url": row[4], "summary": row[5], "content": content,
        "topics": row[7] or [],
        "published_at": row[8].isoformat() if row[8] else None,
    }


@app.get("/article/{article_id}/compare")
def compare_article(article_id: str, user_id: str):
    try:
        uuid.UUID(article_id)
    except ValueError:
        raise HTTPException(404, "Story not found")

    with db() as conn:
        require_user(conn, user_id)
        rows = conn.execute(
            """select b.id, b.title, b.source, b.url, b.image_url, b.summary,
                      b.published_at,
                      1 - (b.embedding <=> a.embedding) as sim
               from articles a
               join articles b on b.id <> a.id
               where a.id = %s
                 and a.embedding is not null
                 and b.embedding is not null
                 and b.source is distinct from a.source
                 and b.published_at between a.published_at - interval '4 days'
                                        and a.published_at + interval '4 days'
               order by b.embedding <=> a.embedding
               limit 30""",
            (article_id,),
        ).fetchall()

    results = []
    seen_sources = set()
    for r in rows:
        if float(r[7]) < 0.68 or r[2] in seen_sources:
            continue
        seen_sources.add(r[2])
        results.append({
            "id": str(r[0]), "title": r[1], "source": r[2], "url": r[3],
            "image_url": r[4], "summary": r[5],
            "published_at": r[6].isoformat() if r[6] else None,
            "similarity": round(float(r[7]), 3),
        })
        if len(results) == 6:
            break
    return results


# ---------------------------------------------------------------
# Search (library first, then live world search)
# ---------------------------------------------------------------

def hit_dict(r):
    return {
        "id": str(r[0]), "title": r[1], "source": r[2], "url": r[3],
        "image_url": r[4], "summary": r[5], "topics": r[6] or [],
        "published_at": r[7].isoformat() if r[7] else None,
        "score": round(float(r[8]), 3),
    }


def run_search(q: str, limit: int = 30):
    vector = next(iter(embedder.embed([q])))
    params = {"v": vec_literal(vector), "like": f"%{q}%", "n": limit}
    with db() as conn:
        rows = conn.execute(
            """select id, title, source, url, image_url, summary, topics,
                      published_at,
                      1 - (embedding <=> %(v)s::vector) as sim
               from articles
               where embedding is not null
                 and (1 - (embedding <=> %(v)s::vector) > 0.6
                      or title ilike %(like)s
                      or content ilike %(like)s)
               order by (1 - (embedding <=> %(v)s::vector))
                        + case when title ilike %(like)s then 0.25 else 0 end desc
               limit %(n)s""",
            params,
        ).fetchall()
    return [hit_dict(r) for r in rows]


@app.get("/search")
def search(q: str, user_id: str):
    q = q.strip()
    if len(q) < 2:
        raise HTTPException(400, "Type at least 2 characters")
    with db() as conn:
        require_user(conn, user_id)
    return run_search(q)


def store_live(conn, items):
    added = 0
    for it in items:
        url_hash = sha(clean_url(it["url"]))
        title_hash = sha(norm_title(it["title"]))
        exists = conn.execute(
            "select 1 from articles where url = %s or url_hash = %s or title_hash = %s limit 1",
            (it["url"], url_hash, title_hash),
        ).fetchone()
        if exists:
            continue

        text = f"{it['title']}. {it['summary']} {(it['content'] or '')[:500]}"
        vector = next(iter(embedder.embed([text])))
        conn.execute(
            """insert into articles
               (url, url_hash, title, title_hash, source, topic, topics,
                published_at, summary, content, image_url, embedding)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)
               on conflict do nothing""",
            (
                it["url"], url_hash, it["title"], title_hash, it["source"],
                "search", ["Search"],
                it["published_at"] or datetime.now(timezone.utc),
                it["summary"], it["content"], it["image"], vec_literal(vector),
            ),
        )
        added += 1
    return added


class LiveSearch(BaseModel):
    q: str


@app.post("/search/live")
def search_world(body: LiveSearch, user_id: str):
    q = body.q.strip()
    if len(q) < 2:
        raise HTTPException(400, "Type at least 2 characters")
    with db() as conn:
        require_user(conn, user_id)

    items = search_live(q)
    with db() as conn:
        added = store_live(conn, items)
    return {"added": added, "results": run_search(q)}


# ---------------------------------------------------------------
# PDF export
# ---------------------------------------------------------------

# Plain "def" (not async) so FastAPI runs it in a worker thread,
# which Playwright's sync API needs.
@app.get("/edition/pdf")
def edition_pdf(user_id: str, day: str | None = None):
    if day:
        edition = edition_by_date(day, user_id)
    else:
        edition = edition_today(user_id)
    pdf = render_pdf(edition)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="pehla-safha-{edition["date"]}.pdf"'
        },
    )


# ---------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------

_ingest_lock = threading.Lock()
_last_result = {"status": "never run"}


def check_secret(x_cron_secret):
    expected = os.environ.get("CRON_SECRET", "")
    if not expected or not x_cron_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not secrets.compare_digest(x_cron_secret, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def ingest_job():
    global _last_result
    if not _ingest_lock.acquire(blocking=False):
        return
    try:
        _last_result = {"status": "running"}
        counts = run_ingest()
        _last_result = {"status": "done", **counts}
    except Exception as ex:
        _last_result = {"status": "error", "detail": str(ex)}
    finally:
        _ingest_lock.release()


@app.post("/ingest/run")
def trigger_ingest(background: BackgroundTasks, x_cron_secret: str = Header(None)):
    check_secret(x_cron_secret)
    if _ingest_lock.locked():
        return {"started": False, "reason": "already running"}
    background.add_task(ingest_job)
    return {"started": True}


@app.get("/ingest/status")
def ingest_status(x_cron_secret: str = Header(None)):
    check_secret(x_cron_secret)
    return _last_result