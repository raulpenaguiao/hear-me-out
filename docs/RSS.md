# RSS feeds

## Endpoints

| URL                                      | Purpose                                  | Token accepted |
| ---------------------------------------- | ---------------------------------------- | -------------- |
| `GET/HEAD /rss/<rssToken>` (or `.xml`)   | RSS 2.0 feed of published episodes       | RSS            |
| `GET/HEAD /audio/<guid>/<token>.<ext>`   | Stable enclosure URL (streams the audio) | RSS or web     |
| `GET/HEAD /cover/<token>.<ext>?v=<hash>` | Channel artwork (`itunes:image`)         | RSS or web     |
| `GET /c/<webToken>`                      | Human-readable channel page with players | web            |

Invalid, revoked or malformed tokens, deactivated channels, and draft or deleted episodes all return
`404 Not Found` with `Cache-Control: no-store`.

## Feed structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Peripécias</title>
    <link>https://ouveisto.example.com</link>              <!-- site, never a secret URL -->
    <description>Histórias &amp; desabafos</description>
    <language>pt-PT</language>
    <lastBuildDate>Fri, 06 Nov 2026 13:20:00 GMT</lastBuildDate>
    <generator>Ouve Isto</generator>
    <atom:link href="https://ouveisto.example.com/rss/TOKEN" rel="self" type="application/rss+xml"/>
    <image><url>…/cover/TOKEN.jpg?v=…</url><title>Peripécias</title><link>…</link></image>
    <itunes:author>Raul</itunes:author>                   <!-- author name, or channel title -->
    <itunes:summary>…</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="…/cover/TOKEN.jpg?v=…"/>         <!-- or /default-cover.png (1400×1400) -->
    <itunes:category text="Society &amp; Culture"/>
    <itunes:block>Yes</itunes:block>                     <!-- ask Apple not to list it -->
    <podcast:locked>yes</podcast:locked>                  <!-- ask platforms not to import it -->
    <item>
      <title>O dia em que perdi o comboio</title>
      <description>…</description>
      <itunes:summary>…</itunes:summary>
      <guid isPermaLink="false">ouve-isto:episode:4b0c7e35-…</guid>
      <pubDate>Sat, 14 Feb 2026 09:30:00 GMT</pubDate>
      <enclosure url="https://ouveisto.example.com/audio/4b0c7e35-…/TOKEN.mp3"
                 length="1234567" type="audio/mpeg"/>
      <itunes:title>…</itunes:title>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:duration>00:20:35</itunes:duration>
    </item>
  </channel>
</rss>
```

Implementation notes:

- XML is produced by a small serializer (`src/lib/xml.ts`). **Every** text node and attribute passes through
  one escaping function, which also strips characters that are illegal in XML 1.0 (control characters, lone
  surrogates, U+FFFE/U+FFFF). Hostile titles cannot break the document (covered by tests).
- Only `status = 'published'` episodes of a `published` channel are included, newest first.
- `pubDate` is RFC 822 (`Date#toUTCString`). `published_at` is set once, on first publication, so
  re-publishing does not reorder history.
- **GUIDs are stable**: `ouve-isto:episode:<episode guid>`. The guid is a random UUID created with the episode,
  immutable (database trigger), and independent of title, description or audio replacement.
- `enclosure length` is the exact byte size verified by the server at upload completion; `type` is the
  canonical MIME type (`audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/wav`, `audio/webm`, `audio/ogg`).
- `itunes:duration` is `HH:MM:SS`, omitted when unknown.
- Response headers: `Content-Type: application/rss+xml; charset=utf-8`,
  `Cache-Control: private, no-cache, max-age=0, must-revalidate`, a strong `ETag`, `X-Robots-Tag: noindex`.

## Enclosure delivery

Podcast apps may fetch the feed today and download an episode days later, so enclosure URLs must not
expire. Ouve Isto never puts short-lived signed URLs in the feed. Instead the enclosure URL is a stable,
tokenized application URL that authorizes **each request** and then:

- **`AUDIO_DELIVERY_MODE=proxy`** (default) streams the object from private R2 with full HTTP semantics:
  `Accept-Ranges: bytes`, single-range `206 Partial Content`, `416` for unsatisfiable ranges, `HEAD`,
  exact `Content-Length`, `ETag`/`If-None-Match`, `If-Range`. Nothing is buffered in memory.
- **`AUDIO_DELIVERY_MODE=redirect`** answers with `302 Found` to a presigned R2 URL valid for one hour. Podcast
  apps follow redirects (it is how most podcast CDNs work); the URL in the feed stays stable. Trade-off: a
  redirect target that someone copies keeps working for up to an hour after revocation.

The file extension in the URL (`.mp3`, `.m4a`, …) helps apps that infer the type from the URL.

## Caching and freshness

The feed is regenerated on every request and marked `private, no-cache`, so:

- publishing an episode makes it appear on the next poll;
- unpublishing or deleting removes it from the next response;
- rotation takes effect immediately (the old URL returns 404).

Apps that poll with `If-None-Match` get `304 Not Modified` until something changes. Audio is
`private, max-age=3600, no-transform` (clients may cache; shared caches may not; never compressed).

## Podcast app compatibility

RSS is an open standard, but support for _private_ feeds added by URL varies:

| App                        | Add by URL                            | Notes                              |
| -------------------------- | ------------------------------------- | ---------------------------------- |
| Apple Podcasts (iOS/macOS) | Library → ⋯ → "Follow a Show by URL…" | No WebM/Opus playback; use M4A/MP3 |
| Pocket Casts               | Search → paste URL                    |                                    |
| Overcast                   | + → "Add URL"                         |                                    |
| AntennaPod, Podcast Addict | Add podcast → by RSS address          | Opus/WebM generally fine           |
| Spotify, YouTube Music     | **Not supported** for private feeds   | Listen on the web page instead     |

Recommendations for best compatibility: publish MP3 or M4A (Safari/iOS recordings are M4A). Chrome,
Firefox and Android record WebM/Opus, which plays in browsers and many Android apps but not in Apple
Podcasts.

Some apps' servers fetch feeds on your behalf (e.g. Pocket Casts, Overcast). Your feed URL is then known to
that service. This is inherent to RSS. See [SECURITY.md](SECURITY.md).

## Validating feeds

Automated tests (`tests/unit/rss.test.ts`, `tests/unit/public-handlers.test.ts`,
`tests/integration/publishing.test.ts`, `tests/e2e/publisher-flow.spec.ts`) check well-formedness, structure,
enclosures, MIME types, GUID stability, published-only filtering, token validation, revocation, escaping and
Range handling.

Manual validation against external validators (use a throwaway channel, then rotate its links afterwards —
validators see the secret URL):

1. Create a test channel, publish an episode, copy the RSS link.
2. Paste the URL into one or more of:
   - **Podbase validator**: https://podba.se/validate/
   - **Cast Feed Validator**: https://www.castfeedvalidator.com/
   - **W3C Feed Validation Service**: https://validator.w3.org/feed/ (generic RSS 2.0)
   - **Apple Podcasts Connect** validation (requires an Apple account; do not submit the feed).
3. Expected warnings: missing `itunes:owner` e-mail (intentionally omitted to avoid exposing the
   publisher's address) and `itunes:block` (intentional). Artwork must be ≥ 1400×1400 JPG/PNG — the default
   cover qualifies; custom covers should too.
4. Rotate the test channel's links (Channel → "Revogar acesso" → "Novos links").

Quick command-line checks:

```bash
curl -sS -D - "https://YOUR-DOMAIN/rss/TOKEN" -o feed.xml && xmllint --noout feed.xml
```

```bash
curl -sS -I "https://YOUR-DOMAIN/audio/GUID/TOKEN.mp3"
```

```bash
curl -sS -D - -o /dev/null -H "Range: bytes=0-1023" "https://YOUR-DOMAIN/audio/GUID/TOKEN.mp3"
```

## Token revocation

From the channel page, "Revogar acesso" offers:

- **Novo link RSS** — new feed token. Existing podcast subscriptions stop updating and their enclosure URLs
  return 404. People who have the web link can re-subscribe from the page.
- **Novo link da página** — new web token. The old page and web-player audio URLs return 404.
- **Novos links (ambos)** — both of the above.

Episodes, GUIDs and audio are untouched, so re-subscribing with the new link shows the full history.
Revocation cannot remove files already downloaded to devices.
