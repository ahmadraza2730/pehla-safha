import os
from concurrent.futures import ThreadPoolExecutor

import psycopg
import trafilatura
from dotenv import load_dotenv

load_dotenv()


def find_image(row):
	article_id, url = row
	try:
		html = trafilatura.fetch_url(url)
		if not html:
			return article_id, None
		meta = trafilatura.extract_metadata(html)
		image = meta.image if meta else None
		if image and image.startswith("http"):
			return article_id, image
	except Exception:
		pass
	return article_id, None


def run(limit=400):
	with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
		rows = conn.execute(
			"""select id, url from articles
			where image_url is null
			  and published_at > now() - interval '3 days'
			order by published_at desc
			limit %s""",
			(limit,),
		).fetchall()

		print(f"looking for images for {len(rows)} articles...")
		found = 0
		with ThreadPoolExecutor(max_workers=8) as pool:
			for article_id, image in pool.map(find_image, rows):
				if image:
					conn.execute(
						"update articles set image_url = %s where id = %s",
						(image, article_id),
					)
					found += 1

		print(f"added {found} images")


if __name__ == "__main__":
	run()