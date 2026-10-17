import json
import math
import os
import secrets
import threading
from datetime import date, datetime, timezone

import psycopg
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastembed import TextEmbedding
from pydantic import BaseModel

from export.pdf import render_pdf
from ingest.run import run as run_ingest

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
            "select count(*) from editions where user_id = %s", (user_id,)
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
               do update set content = excluded.content""",
            (user_id, date.today(), edition["edition_no"], json.dumps(edition)),
        )

    return edition


# ---------------------------------------------------------------
# PDF export
# ---------------------------------------------------------------

# Plain "def" (not async) so FastAPI runs it in a worker thread,
# which Playwright's sync API needs.
@app.get("/edition/pdf")
def edition_pdf(user_id: str):
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