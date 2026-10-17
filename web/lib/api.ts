export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type Article = {
  id: string;
  title: string;
  source: string | null;
  url: string;
  image_url: string | null;
  summary: string | null;
  topics: string[];
  published_at: string;
  score: number;
};

export type Edition = {
  title: string;
  date: string;
  edition_no: number;
  lead: Article;
  sections: { title: string; articles: Article[] }[];
  more: Article[];
};

// One source of truth for the session. Every page uses these.
export const USER_KEY = "safha_user";
export const NAME_KEY = "safha_name";

export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

export function saveSession(userId: string, name: string) {
  localStorage.setItem(USER_KEY, userId);
  localStorage.setItem(NAME_KEY, name);
}

export function clearSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem("pehla_user_id"); // old key from earlier code
}

export async function postJson(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ?? `Server replied ${res.status}`);
  return data;
}

export async function downloadPdf(userId: string, day?: string | null) {
  const q = day ? `&day=${encodeURIComponent(day)}` : "";
  const res = await fetch(
    `${API}/edition/pdf?user_id=${encodeURIComponent(userId)}${q}`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "Could not build the PDF");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pehla-safha-${day ?? new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}