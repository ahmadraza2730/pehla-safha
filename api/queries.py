import os

import psycopg

FRESH_DAYS = 3


def fetch_fresh_articles(topics=None, days=FRESH_DAYS, limit=200):
	sql = """
		select id, title, url, source, topic, published_at, summary, content
		from articles
		where published_at > now() - make_interval(days => %s)
	"""
	params: list = [days]

	if topics:
		sql += " and topic = any(%s)"
		params.append(list(topics))

	sql += " order by published_at desc limit %s"
	params.append(limit)

	with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
		with conn.cursor() as cur:
			cur.execute(sql, params)
			if cur.description is None:
				return []
			cols = [c.name for c in cur.description]
			return [dict(zip(cols, row)) for row in cur.fetchall()]