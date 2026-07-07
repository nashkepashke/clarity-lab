// translations.js
//
// The single source of truth for every user-facing string in the app.
// Nothing in index.html, app.js, or analyzeClaim.js should hardcode text —
// it all comes from TRANSLATIONS[currentLang] (see app.js's `T`).
//
// Badge maps translate the *display* of the English schema values that
// come back from the API (see api/analyze.js's RESPONSE_SCHEMA) — the
// schema values themselves are never translated, only their labels here.
//
// Error messages are keyed by the `error` code the backend returns (see
// api/analyze.js), not by its English `message` — that keeps every string
// the user can see in exactly one place.

var TRANSLATIONS = {
  he: {
    dir: "rtl",
    htmlLang: "he",
    header: {
      title: "פירוק טענות",
      subtitle: "הדביקו טענה או אמירה וראו אותה מפורקת."
    },
    chips: [
      { claim: "יש להעלות את שכר המינימום במשק." },
      { claim: "בתוך עשור, רוב הישראלים יעבדו מהבית לפחות יומיים בשבוע." },
      { claim: "הרפורמה החדשה בתחבורה הציבורית תפתור את בעיית הפקקים בערים הגדולות." }
    ],
    input: {
      label: "הטענה שלך",
      placeholder: "הדביקו או הקלידו טענה או אמירה קצרה...",
      analyzeIdle: "פרקו את הטענה",
      analyzeLoading: "מנתח..."
    },
    confidence: {
      label: "רמת ביטחון:"
    },
    sections: {
      evidenceBasis: "בסיס הראיות",
      steelman: "הגרסה החזקה וההוגנת ביותר",
      strawman: "עיוות נפוץ שכדאי להיזהר ממנו",
      tension: "ערכים מנוגדים",
      whatWouldChange: "מה עשוי לשנות את ההערכה"
    },
    badges: {
      type: {
        Factual: "עובדתית",
        Causal: "סיבתית",
        Prediction: "תחזית",
        "Opinion or value judgment": "דעה או שיפוט ערכי",
        Mixed: "מעורבת"
      },
      assessment: {
        Supported: "נתמכת",
        "Mostly supported": "נתמכת ברובה",
        "Mixed or context-dependent": "מעורבת / תלוית הקשר",
        Contradicted: "נסתרת",
        "Not enough information": "אין מספיק מידע",
        "Not empirically assessable": "לא ניתנת להערכה אמפירית"
      },
      confidence: {
        Low: "נמוכה",
        Medium: "בינונית",
        High: "גבוהה"
      }
    },
    errors: {
      bad_request: "יש לבדוק את הטענה שהזנתם (חסרה או ארוכה מדי) ולנסות שוב.",
      rate_limited: "חרגתם ממכסת הבקשות בשכבה החינמית. המתינו רגע ונסו שוב.",
      model_overloaded: "השירות עמוס כרגע. המתינו רגע ונסו שוב.",
      server_misconfigured: "השרת אינו מוגדר כראוי (חסר מפתח API).",
      upstream_unreachable: "לא ניתן היה להתחבר לשירות הניתוח.",
      network_error: "בעיית רשת: לא ניתן היה להתחבר לשרת.",
      generic: "משהו השתבש בניתוח הטענה. נסו שוב."
    },
    disclaimer: "הדגמה בלבד — לא כלי בדיקת עובדות אמיתי."
  },

  en: {
    dir: "ltr",
    htmlLang: "en",
    header: {
      title: "Claim Breakdown",
      subtitle: "Paste a claim or statement and see it broken down."
    },
    chips: [
      { claim: "Coffee is bad for your health." },
      { claim: "Remote work will become the default for most office jobs by 2030." },
      { claim: "This new law is the right way to fix the housing crisis." }
    ],
    input: {
      label: "Your claim",
      placeholder: "Paste or type a short claim or statement...",
      analyzeIdle: "Break it down",
      analyzeLoading: "Analyzing..."
    },
    confidence: {
      label: "Confidence:"
    },
    sections: {
      evidenceBasis: "Evidence basis",
      steelman: "Steelman: strongest fair version",
      strawman: "Strawman to watch for",
      tension: "Values in tension",
      whatWouldChange: "What could change this"
    },
    badges: {
      type: {
        Factual: "Factual",
        Causal: "Causal",
        Prediction: "Prediction",
        "Opinion or value judgment": "Opinion or value judgment",
        Mixed: "Mixed"
      },
      assessment: {
        Supported: "Supported",
        "Mostly supported": "Mostly supported",
        "Mixed or context-dependent": "Mixed or context-dependent",
        Contradicted: "Contradicted",
        "Not enough information": "Not enough information",
        "Not empirically assessable": "Not empirically assessable"
      },
      confidence: {
        Low: "Low",
        Medium: "Medium",
        High: "High"
      }
    },
    errors: {
      bad_request: "Please check your claim text (missing or too long) and try again.",
      rate_limited: "You're sending requests too fast for the free tier. Wait a moment and try again.",
      model_overloaded: "The analysis service is under heavy load right now. Wait a moment and try again.",
      server_misconfigured: "The server isn't configured correctly (missing API key).",
      upstream_unreachable: "Couldn't reach the analysis service.",
      network_error: "Network problem: couldn't reach the server.",
      generic: "Something went wrong analyzing that claim. Try again."
    },
    disclaimer: "Demo only — not a real fact-checker."
  }
};

// Language toggle button labels are each language's name written in
// itself, and don't change when the active language changes.
var LANGUAGE_LABELS = {
  he: "עברית",
  en: "English"
};
