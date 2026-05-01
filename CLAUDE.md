# Accento — Language Learning PWA

Vanilla HTML/CSS/JS PWA, no build step, no framework. Served as static files.

## Structure

```
index.html          ← language picker (root)
sw.js               ← service worker (network-first, bump CACHE_NAME on every change)
manifest.json
spanish/
  vocab.js          ← VS object: all data, SRS, TTS, AI, settings
  index.html        ← vocab list, study cards, stats, settings modal
  lessons.html      ← lesson exercises
dutch/
  vocab.js          ← same structure, VOCAB_KEY='dutch_vocab', default lang 'nl-NL'
  index.html
  lessons.html
```

## Key conventions

- **Always bump `sw.js` CACHE_NAME** (accento-vN) when editing any file — otherwise mobile Chrome serves stale cache. User must close+reopen the PWA twice to pick up a new SW.
- Spanish and Dutch are parallel — changes to one almost always need mirroring in the other.
- No comments unless the WHY is non-obvious.

## Data & storage

| Key | Contents |
|-----|----------|
| `spanish_vocab` / `dutch_vocab` | JSON array of word cards |
| `spanish_settings` / `dutch_settings` | `{ claudeApiKey, geminiApiKey, aiProvider }` |
| `accento_shared` | `{ googleTtsKey, ttsVoice }` — shared across languages |
| `spanish_streak` / `dutch_streak` | `{ current, longest, lastStudyDate }` |
| `spanish-daily` / `dutch-daily` | `{ date, count }` — daily lesson goal (3/day) |
| Cache API `accento-audio-v1` | Google TTS MP3s keyed by `https://tts.accento/{lang}/{encodeURIComponent(text)}` |

## Word card schema

```js
{
  id, term, translation, definition, partOfSpeech, examples, tags, created,
  interval, easeFactor, repetitions, nextReview, lastReview,  // SM-2 SRS
  lessonWrong, lessonRight, correctSinceWrong                 // error tracking
}
```

- `translation` → Title Case (via `_titleCase`)
- `definition` → Sentence case (via `_sentenceCase`)
- Struggling badge clears after 3 consecutive correct (`correctSinceWrong >= 3`)

## TTS (Google Cloud Neural2)

`VS.speak(text, lang)` in vocab.js:
- Calls `this._getAudioCtx().resume()` **synchronously** in the tap handler — required for iOS autoplay unlock
- Checks `accento-audio-v1` cache first (returns ArrayBuffer)
- On miss: POST `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`
- Response: base64 `audioContent` → decode → store in cache → play via Web Audio API (`ctx.decodeAudioData` + `createBufferSource`)
- Falls back to `speechSynthesis` if no key or any error

Voice map:
```js
'es-ES': { female: 'es-ES-Neural2-A', male: 'es-ES-Neural2-B' }
'nl-NL': { female: 'nl-NL-Neural2-A', male: 'nl-NL-Neural2-E' }
```

Key stored in `accento_shared.googleTtsKey`. Voice gender in `accento_shared.ttsVoice` ('female'/'male').

## AI generation

`VS._aiCall(prompt, maxTokens)` in vocab.js — supports Claude (Haiku) and Gemini (2.5 Flash). Provider set per-language in settings. Free translation via MyMemory API (no key needed).

## SRS (SM-2)

`VS.recordAnswer(id, correct)` — advances SRS once per calendar day on correct; soft-demotes on wrong. `VS.getDue()`, `VS.getWeak()`. Lesson pool modes: default (max 3 new + due), `?pool=weak`, `?pool=due`.

## Lesson exercise types

`match-pairs`, `listen-match`, `translate-to-en`, `translate-to-es`/`nl`, `flip-card`, `type-word`, `listen-type`, `type-card`, `sentence-scramble`

**listen-match TTS bug fixed**: use `data-term="${escHtml(term)}"` + `this.dataset.term` in onclick — NOT `JSON.stringify` inline (breaks HTML attribute parsing).

## Layout (lessons.html)

Body is `height: 100dvh; overflow: hidden` — no page scroll ever.
Screen is `flex: 1; min-height: 0` — bounded flex child.
`#screen-q` is `overflow: hidden` — bounded, makes `flex: 1` on children work.
`.choices` and `.mp-grid` both have `flex: 1; min-height: 0` to fill available space.
`.mp-grid` has `max-height: 500px` to prevent tiles becoming absurdly tall.
