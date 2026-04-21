'use strict';
(function(g) {
  const VOCAB_KEY    = 'dutch_vocab';
  const SETTINGS_KEY = 'dutch_settings';
  const STREAK_KEY   = 'dutch_streak';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const VS = {

    /* ── Storage ──────────────────────────────────── */
    getAll() {
      try { return JSON.parse(localStorage.getItem(VOCAB_KEY) || '[]'); }
      catch(e) { return []; }
    },
    save(words) {
      localStorage.setItem(VOCAB_KEY, JSON.stringify(words));
    },

    /* ── CRUD ─────────────────────────────────────── */
    add(data) {
      const words = this.getAll();
      const card = {
        id:           uid(),
        term:         (data.term         || '').trim(),
        translation:  (data.translation  || '').trim(),
        definition:   (data.definition   || '').trim(),
        partOfSpeech: (data.partOfSpeech || '').trim(),
        examples:      data.examples     || [],
        tags:          data.tags         || [],
        created:      Date.now(),
        // SRS
        interval:    0,
        easeFactor:  2.5,
        repetitions: 0,
        nextReview:  Date.now(),
        lastReview:  null,
        // Error tracking
        lessonWrong: 0,
        lessonRight: 0
      };
      words.push(card);
      this.save(words);
      return card;
    },

    update(id, changes) {
      const words = this.getAll();
      const i = words.findIndex(w => w.id === id);
      if (i === -1) return null;
      words[i] = { ...words[i], ...changes };
      this.save(words);
      return words[i];
    },

    remove(id) {
      this.save(this.getAll().filter(w => w.id !== id));
    },

    /* ── SRS (SM-2) ───────────────────────────────── */
    getDue(limit) {
      const now = Date.now();
      const due = this.getAll()
        .filter(w => (w.nextReview || 0) <= now)
        .sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
      return limit ? due.slice(0, limit) : due;
    },

    getWeak(limit) {
      const weak = this.getAll()
        .filter(w => (w.lessonWrong || 0) > 0)
        .sort((a, b) => (b.lessonWrong || 0) - (a.lessonWrong || 0));
      return limit ? weak.slice(0, limit) : weak;
    },

    // Called by lessons when a word is answered
    trackLessonResult(id, wasCorrect) {
      const words = this.getAll();
      const i = words.findIndex(w => w.id === id);
      if (i === -1) return;
      const w = words[i];
      if (wasCorrect) {
        words[i].lessonRight = (w.lessonRight || 0) + 1;
      } else {
        words[i].lessonWrong = (w.lessonWrong || 0) + 1;
        // Mark as due NOW so it surfaces in flashcards
        words[i].nextReview = Date.now();
      }
      this.save(words);
    },

    // grade: 0=Again  1=Hard  2=Good  3=Easy
    applyGrade(card, grade) {
      let { repetitions, easeFactor, interval } = card;

      if (grade === 0) {
        repetitions = 0;
        interval    = 1;
      } else {
        if      (repetitions === 0) interval = 1;
        else if (repetitions === 1) interval = 6;
        else                        interval = Math.round(interval * easeFactor);

        if (grade === 1) interval = Math.max(1, Math.round(interval * 0.6));
        if (grade === 3) interval = Math.round(interval * 1.5);
        repetitions++;
      }

      easeFactor = Math.max(1.3,
        easeFactor + 0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)
      );

      const now = Date.now();
      return { ...card, repetitions, easeFactor, interval, lastReview: now,
               nextReview: now + interval * 86400000 };
    },

    intervalLabel(card) {
      if (!card.lastReview) return 'New';
      const d = Math.round(card.interval || 1);
      if (d < 7)  return d + 'd';
      if (d < 30) return Math.round(d / 7) + 'w';
      return Math.round(d / 30) + 'mo';
    },

    /* ── Stats ────────────────────────────────────── */
    getStats() {
      const words = this.getAll();
      const now   = Date.now();
      return {
        total:  words.length,
        due:    words.filter(w => (w.nextReview || 0) <= now).length,
        isNew:  words.filter(w => !w.lastReview).length,
        weak:   words.filter(w => (w.lessonWrong || 0) > 0).length
      };
    },

    /* ── Settings ─────────────────────────────────── */
    getSettings() {
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
      catch(e) { return {}; }
    },
    saveSettings(patch) {
      localStorage.setItem(SETTINGS_KEY,
        JSON.stringify({ ...this.getSettings(), ...patch }));
    },

    /* ── Streak ───────────────────────────────────── */
    getStreak() {
      try { return JSON.parse(localStorage.getItem(STREAK_KEY) || '{}'); }
      catch(e) { return {}; }
    },
    recordStudyDay() {
      const today = new Date().toISOString().slice(0, 10);
      const s = this.getStreak();
      if (s.lastStudyDate === today) return s;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const current = s.lastStudyDate === yesterday ? (s.current || 0) + 1 : 1;
      const longest = Math.max(current, s.longest || 0);
      const updated = { lastStudyDate: today, current, longest };
      localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
      return updated;
    },

    /* ── TTS ──────────────────────────────────────── */
    hasTTS() { return 'speechSynthesis' in window; },
    speak(text, lang) {
      if (!this.hasTTS()) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || 'nl-NL';
      u.rate = 0.85;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    },

    /* ── Free Auto-fill (no key needed) ──────────── */
    async autoFill(term) {
      const tr = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=nl|en`
      );
      if (!tr.ok) throw new Error(`Translation error ${tr.status}`);
      const trData = await tr.json();
      if (trData.responseStatus !== 200) throw new Error(trData.responseDetails || 'Translation failed');
      const translation = trData.responseData.translatedText;

      const seen = new Set([translation.toLowerCase()]);
      const altTranslations = (trData.matches || [])
        .map(m => (m.translation || '').trim())
        .filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
        .slice(0, 5);

      const result = { translation, altTranslations, definition: '', partOfSpeech: '', examples: [] };

      // Dictionary lookup for definition + POS
      try {
        const dr = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(translation.split(' ')[0])}`
        );
        if (dr.ok) {
          const dict = await dr.json();
          const allDefs = (dict[0]?.meanings || []).flatMap(m =>
            (m.definitions || []).slice(0, 2).map(d => ({
              partOfSpeech: m.partOfSpeech || '',
              definition:   d.definition   || ''
            }))
          ).slice(0, 6);
          if (allDefs.length) {
            result.definitions  = allDefs;
            result.partOfSpeech = allDefs[0].partOfSpeech;
            result.definition   = allDefs[0].definition;
          }
        }
      } catch(_) { /* best-effort */ }

      return result;
    },

    /* ── AI Generation ────────────────────────────── */
    async generate(term) {
      const s = this.getSettings();
      const provider = s.aiProvider || 'claude';

      const PROMPT =
`You are a Dutch language expert. For the Dutch word or phrase "${term}", return ONLY a JSON object — no other text:
{
  "translation": "English translation",
  "definition": "One sentence English definition",
  "partOfSpeech": "noun/verb/adjective/adverb/phrase/etc",
  "examples": [
    { "nl": "Natural Dutch sentence using the exact word/phrase.", "en": "English translation." },
    { "nl": "Another natural example.", "en": "English translation." }
  ]
}`;

      if (provider === 'gemini') {
        const key = s.geminiApiKey;
        if (!key) throw new Error('No Gemini API key set — add it in Settings ⚙️');
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }] })
          }
        );
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || `Gemini API error ${resp.status}`);
        }
        const data = await resp.json();
        const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Could not parse AI response');
        return JSON.parse(match[0]);
      }

      // Default: Claude
      const key = s.claudeApiKey;
      if (!key) throw new Error('No Claude API key set — add it in Settings ⚙️');
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: PROMPT }]
        })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Claude API error ${resp.status}`);
      }
      const data = await resp.json();
      const text = (data.content?.[0]?.text || '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse AI response');
      return JSON.parse(match[0]);
    }
  };

  g.VS = VS;
})(window);
