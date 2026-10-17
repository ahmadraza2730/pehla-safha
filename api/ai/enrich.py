import os
import re

import psycopg
from dotenv import load_dotenv
from fastembed import TextEmbedding

load_dotenv()

embedder = TextEmbedding("BAAI/bge-small-en-v1.5")  # 384 dimensions

TOPIC_LABELS = {
	"pakistan": "Pakistan",
	"world": "World",
	"tech": "Technology",
	"business": "Business",
	"sports": "Sports",
	"science": "Science",
	"culture": "Culture",
}

KEYWORDS = {
	"Cricket": ["cricket", "psl", "test match", "t20", "pcb"],
	"AI": [" ai ", "artificial intelligence", "chatgpt", "openai", "machine learning"],
	"Politics": ["election", "parliament", "minister", "senate", "government", "court"],
	"Health": ["health", "hospital", "disease", "vaccine", "dengue", "cancer"],
	"Gaming": ["gaming", "video game", "playstation", "xbox", "nintendo", "steam"],
	"Education": ["university", "school", "exam", "student", "education"],
	"Environment": ["climate", "flood", "pollution", "emissions", "wildlife"],
	"Entertainment": ["film", "movie", "drama", "actor", "netflix"],
}


def vec_literal(vector):
	return "[" + ",".join(f"{float(x):.6f}" for x in vector) + "]"


def strip_html(text):
	text = re.sub(r"<[^>]+>", " ", text or "")
	return re.sub(r"\s+", " ", text).strip()


def tags_for(topic, title, summary):
	tags = []
	if topic in TOPIC_LABELS:
		tags.append(TOPIC_LABELS[topic])
	haystack = f" {title} {summary} ".lower()
	for label, words in KEYWORDS.items():
		if label not in tags and any(w in haystack for w in words):
			tags.append(label)
	return tags


def run(limit=2000):
	done = 0
	with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
		rows = conn.execute(
			"""select id, title, summary, content, topic
			from articles
			where embedding is null and published_at is not null
			order by published_at desc
			limit %s""",
			(limit,),
		).fetchall()

		for article_id, title, summary, content, topic in rows:
			clean_summary = strip_html(summary)
			if not clean_summary and content:
				clean_summary = content[:300]
			clean_summary = clean_summary[:300]

			text = f"{title}. {clean_summary} {(content or '')[:500]}"
			vector = next(iter(embedder.embed([text])))

			conn.execute(
				"""update articles
				set embedding = %s::vector, summary = %s, topics = %s
				where id = %s""",
				(
					vec_literal(vector),
					clean_summary,
					tags_for(topic, title, clean_summary),
					article_id,
				),
			)
			done += 1
			if done % 50 == 0:
				print(f"enriched {done}/{len(rows)}")

	print(f"enriched {done} articles")
	return done


if __name__ == "__main__":
	run()