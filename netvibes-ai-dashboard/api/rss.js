const { URL } = require("node:url");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use a GET request." });
  }

  const feedUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  if (!feedUrl) return res.status(400).json({ error: "Please provide an RSS feed address." });

  let parsedUrl;
  try {
    parsedUrl = new URL(feedUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error();
    if (isBlockedHost(parsedUrl.hostname)) throw new Error("blocked");
  } catch (error) {
    return res.status(400).json({ error: error.message === "blocked" ? "That feed address is not allowed." : "That does not look like a valid web address." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "NetvibesAI/1.0 (+https://vercel.app)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.8, */*;q=0.5"
      }
    });

    if (!response.ok) throw new Error(`The feed returned ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 5_000_000) throw new Error("This feed is too large to load safely.");

    const xml = await response.text();
    if (xml.length > 5_000_000) throw new Error("This feed is too large to load safely.");
    const feed = parseFeed(xml, parsedUrl.toString());
    if (!feed.items.length) throw new Error("No RSS or Atom items were found at this address.");

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(feed);
  } catch (error) {
    const message = error?.name === "AbortError" ? "The feed took too long to respond." : (error?.message || "Could not load this feed.");
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
};

function parseFeed(xml, baseUrl) {
  const isAtom = /<feed\b/i.test(xml) && /xmlns=["'][^"']*Atom/i.test(xml);
  const blocks = isAtom ? matchBlocks(xml, "entry") : matchBlocks(xml, "item");
  const titleArea = isAtom ? between(xml, /<feed\b[^>]*>/i, /<entry\b/i) : between(xml, /<channel\b[^>]*>/i, /<item\b/i);
  const feedTitle = cleanText(tagValue(titleArea || xml, ["title"])) || safeHostname(baseUrl);

  const items = blocks.slice(0, 50).map((block, index) => {
    const title = cleanText(tagValue(block, ["title"])) || "Untitled";
    const rawLink = isAtom ? atomLink(block) : tagValue(block, ["link"]);
    const canonicalUrl = absolutize(cleanText(rawLink), baseUrl);
    const sourceItemId = cleanText(tagValue(block, ["guid", "id"])) || canonicalUrl || `${title}-${index}`;
    const publishedAt = normalizeDate(cleanText(tagValue(block, ["pubDate", "published", "updated", "dc:date"]))) || null;
    const author = cleanText(tagValue(block, ["author", "dc:creator", "name"])) || null;
    const rawContent = rawValue(block, ["content:encoded", "content", "description", "summary"]) || "";
    const contentHtml = normalizeFeedHtml(rawContent, baseUrl);
    const excerpt = cleanText(rawValue(block, ["description", "summary", "content"]) || contentHtml).slice(0, 700);
    const enclosure = enclosureData(block, baseUrl);
    const imageUrl = enclosure.imageUrl || firstImage(contentHtml, baseUrl) || mediaImage(block, baseUrl) || null;

    return {
      sourceItemId,
      title,
      canonicalUrl: canonicalUrl || null,
      publishedAt,
      author,
      excerpt,
      contentHtml,
      imageUrl,
      media: enclosure.media
    };
  });

  return { title: feedTitle, sourceUrl: baseUrl, items };
}

function matchBlocks(xml, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...xml.matchAll(regex)].map((match) => match[1]);
}

function tagValue(block, names) {
  return rawValue(block, names);
}

function rawValue(block, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i");
    const match = block.match(regex);
    if (match) return unwrapCdata(match[1]).trim();
  }
  return "";
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)];
  const alternate = links.find((match) => !/rel=["'](?:self|enclosure)["']/i.test(match[1])) || links[0];
  if (!alternate) return "";
  const href = alternate[1].match(/href=["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : "";
}

function enclosureData(block, baseUrl) {
  const media = [];
  let imageUrl = null;
  const regex = /<(?:enclosure|media:content)\b([^>]*)\/?\s*>/gi;
  for (const match of block.matchAll(regex)) {
    const attrs = match[1];
    const urlMatch = attrs.match(/url=["']([^"']+)["']/i);
    if (!urlMatch) continue;
    const url = absolutize(decodeEntities(urlMatch[1]), baseUrl);
    if (!url) continue;
    const type = (attrs.match(/type=["']([^"']+)["']/i)?.[1] || "").toLowerCase();
    const kind = type.startsWith("image/") ? "image" : type.startsWith("audio/") ? "audio" : type.startsWith("video/") ? "video" : "embed";
    media.push({ type: kind, url, mimeType: type || undefined });
    if (!imageUrl && kind === "image") imageUrl = url;
  }
  return { media, imageUrl };
}

function mediaImage(block, baseUrl) {
  const match = block.match(/<media:(?:thumbnail|content)\b[^>]*url=["']([^"']+)["'][^>]*>/i);
  return match ? absolutize(decodeEntities(match[1]), baseUrl) : null;
}

function normalizeFeedHtml(value, baseUrl) {
  // Some feeds (including xkcd) HTML-encode their entire description, so
  // "<img …>" arrives as "&lt;img …&gt;". Decode it before sanitizing.
  let html = decodeEntities(unwrapCdata(String(value || "")));
  if (/&(?:lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i.test(html) && !/<[a-z][\s>]/i.test(html)) {
    html = decodeEntities(html);
  }

  html = removeDangerousMarkup(html);
  return html.replace(/\b(src|href)=(["'])(.*?)\2/gi, (full, name, quote, url) => {
    const absolute = absolutize(decodeEntities(url), baseUrl);
    return absolute ? `${name}=${quote}${absolute}${quote}` : full;
  });
}

function firstImage(html, baseUrl) {
  const match = html.match(/<img\b[^>]*src=["']([^"']+)["']/i);
  return match ? absolutize(decodeEntities(match[1]), baseUrl) : null;
}

function cleanText(value) {
  return decodeEntities(unwrapCdata(String(value || "")))
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapCdata(value) {
  return String(value || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, "$1");
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (full, name) => named[name.toLowerCase()] ?? full);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function absolutize(value, baseUrl) {
  if (!value) return "";
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function between(text, startRegex, endRegex) {
  const start = text.search(startRegex);
  if (start < 0) return "";
  const afterStart = text.slice(start);
  const openEnd = afterStart.search(/>/);
  if (openEnd < 0) return "";
  const rest = afterStart.slice(openEnd + 1);
  const end = rest.search(endRegex);
  return end < 0 ? rest : rest.slice(0, end);
}

function removeDangerousMarkup(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .slice(0, 150000);
}

function safeHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return "RSS feed"; }
}

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "0.0.0.0" || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return false;
}

module.exports._test = { parseFeed, cleanText, decodeEntities, isBlockedHost };
