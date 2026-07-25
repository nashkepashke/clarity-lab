const assert = require("node:assert/strict");
const { parseFeed, isBlockedHost } = require("../api/rss.js")._test;

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Demo</title><item><title><![CDATA[Hello &amp; goodbye]]></title><link>https://example.com/1</link><guid>one</guid><pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Story <img src="https://example.com/a.jpg"></p>]]></description></item></channel></rss>`;
const parsedRss = parseFeed(rss, "https://example.com/feed.xml");
assert.equal(parsedRss.title, "Demo");
assert.equal(parsedRss.items.length, 1);
assert.equal(parsedRss.items[0].title, "Hello & goodbye");
assert.equal(parsedRss.items[0].imageUrl, "https://example.com/a.jpg");

const encodedComic = `<?xml version="1.0"?><rss version="2.0"><channel><title>xkcd.com</title><item><title>Comic</title><link>https://xkcd.com/1/</link><description>&lt;img src="https://imgs.xkcd.com/comics/test.png" title="A title" alt="A title" /&gt;</description></item></channel></rss>`;
const parsedComic = parseFeed(encodedComic, "https://xkcd.com/rss.xml");
assert.equal(parsedComic.items[0].imageUrl, "https://imgs.xkcd.com/comics/test.png");
assert.match(parsedComic.items[0].contentHtml, /<img\b/i);

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Demo</title><entry><title>Entry one</title><id>tag:example,1</id><updated>2026-07-20T12:00:00Z</updated><link rel="alternate" href="/post/1"/><summary>Summary</summary></entry></feed>`;
const parsedAtom = parseFeed(atom, "https://example.com/feed");
assert.equal(parsedAtom.title, "Atom Demo");
assert.equal(parsedAtom.items[0].canonicalUrl, "https://example.com/post/1");
assert.equal(isBlockedHost("localhost"), true);
assert.equal(isBlockedHost("192.168.1.2"), true);
assert.equal(isBlockedHost("example.com"), false);
console.log("RSS parser tests passed");
