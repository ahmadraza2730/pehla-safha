import html

from playwright.sync_api import sync_playwright

CSS = """
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #141414;
	background: #F6F1E7; margin: 0; font-size: 10pt; line-height: 1.4; }
.masthead { text-align: center; border-top: 3px double #141414;
	border-bottom: 3px double #141414; padding: 10px 0 8px; }
.strip { display: flex; justify-content: space-between; font-size: 7.5pt;
	letter-spacing: 0.2em; text-transform: uppercase; color: #555; }
.masthead h1 { font-size: 40pt; margin: 6px 0 0; line-height: 1.05; }
.masthead .sub { font-style: italic; color: #444; margin: 2px 0 0; }
.meta { font-family: Arial, sans-serif; font-size: 7pt; letter-spacing: 0.15em;
	text-transform: uppercase; color: #555; margin: 0 0 3px; }
.lead { border-bottom: 2px solid #141414; padding: 12px 0 14px; }
.lead img { width: 100%; max-height: 70mm; object-fit: cover; filter: grayscale(1);
	margin-bottom: 8px; }
.lead h2 { font-size: 24pt; line-height: 1.12; margin: 0 0 6px; }
.lead p { font-size: 11pt; margin: 0; }
.section { margin-top: 14px; }
.section h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: 0.08em;
	margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #141414; }
.cols { column-count: 2; column-gap: 8mm; column-rule: 1px solid #bbb; }
.story { break-inside: avoid; margin-bottom: 10px; }
.story img { width: 100%; height: 30mm; object-fit: cover; filter: grayscale(1);
	margin-bottom: 4px; }
.story h3 { font-size: 12pt; line-height: 1.2; margin: 0 0 3px; }
.story p { font-size: 9pt; margin: 0; color: #333; }
.more li { margin-bottom: 4px; }
.more .src { font-family: Arial, sans-serif; font-size: 7pt; color: #666;
	text-transform: uppercase; margin-left: 6px; }
.foot { margin-top: 16px; border-top: 1px solid #141414; padding-top: 5px;
	text-align: center; font-size: 7.5pt; color: #666; }
"""


def esc(value):
	return html.escape(value or "")


def img(article):
	url = article.get("image_url")
	return f'<img src="{esc(url)}" alt="">' if url else ""


def meta(article):
	return f'<p class="meta">{esc(article.get("source"))}</p>'


def story_html(a):
	summary = f'<p>{esc(a.get("summary"))}</p>' if a.get("summary") else ""
	return (
		f'<div class="story">{img(a)}{meta(a)}'
		f'<h3>{esc(a["title"])}</h3>{summary}</div>'
	)


def edition_html(e):
	lead = e["lead"]
	lead_summary = f'<p>{esc(lead.get("summary"))}</p>' if lead.get("summary") else ""

	sections = ""
	for s in e.get("sections", []):
		stories = "".join(story_html(a) for a in s["articles"])
		sections += (
			f'<div class="section"><h2>{esc(s["title"])}</h2>'
			f'<div class="cols">{stories}</div></div>'
		)

	more = ""
	if e.get("more"):
		items = "".join(
			f'<li>{esc(a["title"])}<span class="src">{esc(a.get("source"))}</span></li>'
			for a in e["more"]
		)
		more = f'<div class="section"><h2>Also today</h2><ul class="more">{items}</ul></div>'

	return f"""<!doctype html><html><head><meta charset="utf-8">
<style>{CSS}</style></head><body>
<div class="masthead">
	<div class="strip"><span>{esc(e["date"])}</span><span>Edition No. {e["edition_no"]}</span></div>
	<h1>{esc(e["title"])}</h1>
	<p class="sub">Pehla Safha &middot; The First Page</p>
</div>
<div class="lead">{img(lead)}{meta(lead)}<h2>{esc(lead["title"])}</h2>{lead_summary}</div>
{sections}
{more}
<div class="foot">Printed for you by Pehla Safha</div>
</body></html>"""


def render_pdf(edition):
	with sync_playwright() as p:
		browser = p.chromium.launch()
		try:
			page = browser.new_page()
			page.set_content(edition_html(edition), wait_until="load")
			return page.pdf(format="A4", print_background=True)
		finally:
			browser.close()