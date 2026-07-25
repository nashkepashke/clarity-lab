module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use a POST request." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({
    error: "Gemini is not connected yet. Add GEMINI_API_KEY in Vercel settings, then redeploy."
  });

  const body = typeof req.body === "string" ? json(req.body) : (req.body || {});
  const interests = String(body.interests || "Important and surprising items").slice(0, 1000);
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!items.length) return res.status(400).json({ error: "There are no feed items to summarize." });

  const prompt = [
    "Create a concise daily personal-dashboard briefing from these RSS items.",
    `User interests: ${interests}`,
    "Rank by likely importance and relevance, merge duplicates, avoid hype, and do not invent facts beyond the supplied titles and excerpts.",
    "Return JSON with: overview (string), highlights (up to 8 objects with title, source, whyItMatters), and themes (3-6 short strings).",
    JSON.stringify(items.map((item, i) => ({
      number: i + 1,
      source: String(item.source || "Unknown").slice(0, 120),
      title: String(item.title || "Untitled").slice(0, 300),
      excerpt: String(item.excerpt || "").slice(0, 900),
      url: item.url || null
    })))
  ].join("\n\n");

  const schema = {
    type: "OBJECT",
    properties: {
      overview: { type: "STRING" },
      highlights: { type: "ARRAY", items: { type: "OBJECT", properties: {
        title: { type: "STRING" }, source: { type: "STRING" }, whyItMatters: { type: "STRING" }
      }, required: ["title", "source", "whyItMatters"] } },
      themes: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["overview", "highlights", "themes"]
  };

  const models = [...new Set([
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-flash-latest"
  ].filter(Boolean))];

  let lastError;
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1800,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(result?.error?.message || `Gemini returned ${response.status}.`);
        if ([400, 404].includes(response.status)) continue;
        throw lastError;
      }
      const text = result?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      const parsed = json(text);
      if (!parsed) throw new Error("Gemini returned an unreadable response.");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ summary: parsed, model });
    } catch (error) {
      lastError = error;
      if (!/not found|not supported|invalid model/i.test(error?.message || "")) break;
    }
  }
  return res.status(502).json({ error: lastError?.message || "Gemini could not create the briefing." });
};

function json(value) {
  try { return JSON.parse(value); } catch (_) { return null; }
}
