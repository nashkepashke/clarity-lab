// translations.js
//
// The single source of truth for every user-facing string in the app.
// Nothing in index.html, app.js, or analyzeClaim.js should hardcode text
// — it all comes from TRANSLATIONS[currentLang] (see app.js's `T`).
//
// Badge maps translate the *display* of the English schema/code values
// that come back from the API (see api/triage.js and api/evidence.js) —
// those values themselves are never translated, only their labels here.
// Same for the epistemic-profile dial levels and source tiers: the code
// computes/returns fixed English keys, this file supplies the label and
// (for dials) a justification template function per level.
//
// Error messages are keyed by the `error` code the backend returns, not
// by its English `message` — that keeps every string the user can see
// in exactly one place.

var TRANSLATIONS = {
  he: {
    dir: "rtl",
    htmlLang: "he",
    dateLocale: "he-IL",
    header: {
      title: "פירוק טענות",
      subtitle: "הדביקו טענה, הבטחה או פסקה שלמה — נפרק אותה לגורמים ונבדוק כל חלק."
    },
    chips: [
      { claim: "יש להעלות את שכר המינימום במשק." },
      { claim: "בתוך עשור, רוב הישראלים יעבדו מהבית לפחות יומיים בשבוע." },
      { claim: "הרפורמה החדשה בתחבורה הציבורית תפתור את בעיית הפקקים בערים הגדולות." }
    ],
    input: {
      label: "הטענה שלך",
      placeholder: "הדביקו או הקלידו טענה, הבטחה, או פסקה שלמה...",
      analyzeIdle: "פרקו את הטענה",
      analyzeWithImageIdle: "קראו את התמונה",
      phaseTriage: "שובר לגורמים...",
      phaseEvidence: "בודק מקורות...",
      extractPhase: "קורא את התמונה..."
    },
    image: {
      attachButton: "הוסיפו תמונה",
      hint: "אפשר גם להדביק, לגרור או להעלות צילום מסך של הטענה.",
      removeButton: "הסירו את התמונה",
      previewAlt: "תצוגה מקדימה של התמונה המצורפת",
      extractPrompt: "האם זו הטענה? ערכו אם צריך, ואז לחצו שוב כדי לנתח."
    },
    confidence: {
      label: "רמת ביטחון:"
    },
    verdict: {
      overallLabel: "מסקנה כוללת",
      noResult: "לא הצלחנו לנתח אף אחת מהטענות."
    },
    claim: {
      errorMessage: "הניתוח של הטענה הזו נכשל. ייתכן שזמני — נסו שוב.",
      relatedPremises: "טענות עובדתיות קשורות:",
      notSourceChecked: "לא נבדק מול מקורות — הערכה כללית בלבד.",
      sources: function (n) {
        return n === 0 ? "מקורות" : "מקורות (" + n + ")";
      },
      noSources: "לא נמצאו מקורות."
    },
    sections: {
      whatWouldChangeAssessment: "מה עשוי לשנות את ההערכה",
      evidenceSummary: "סיכום הראיות",
      denominatorCheck: "ביחס למה?",
      precisionCheck: "עד כמה הטענה מדויקת?",
      alternativeExplanations: "הסברים חלופיים אפשריים",
      correlationCaution: "מתאם מול סיבתיות",
      distinguishingEvidence: "מה יבחין בין ההסברים",
      referenceClassAndBaseRate: "מקרים דומים בעבר",
      feasibility: "האם זה בר-ביצוע?",
      tension: "ערכים מנוגדים",
      steelman: "הגרסה החזקה וההוגנת ביותר",
      strawmanWarning: "עיוות נפוץ שכדאי להיזהר ממנו"
    },
    badges: {
      type: {
        Empirical: "עובדתית",
        Causal: "סיבתית",
        "Prediction-or-promise": "תחזית או הבטחה",
        Normative: "שיפוט ערכי",
        Mixed: "מעורבת"
      },
      assessment: {
        Supported: "נתמכת",
        "Mostly supported": "נתמכת ברובה",
        "Mixed or context-dependent": "מעורבת / תלוית הקשר",
        Contradicted: "נסתרת",
        "Not enough information": "אין מספיק מידע",
        "Not empirically assessable": "לא ניתנת להערכה אמפירית",
        "Too recent to assess": "מוקדם מדי להעריך",
        "Outcome not yet knowable": "התוצאה עדיין לא ידועה"
      },
      confidence: {
        Low: "נמוכה",
        Medium: "בינונית",
        High: "גבוהה"
      },
      sourceTier: {
        "Primary official": "מקור רשמי ראשוני",
        Academic: "אקדמי",
        "Established journalism": "עיתונות מבוססת",
        "Fact-check org": "ארגון בדיקת עובדות",
        Other: "אחר"
      }
    },
    epistemicProfile: {
      checkability: {
        name: "ניתנות לבדיקה",
        levels: {
          "settled-by-evidence": "מוכרעת על בסיס ראיות",
          partially: "חלקית",
          "values-or-prediction": "ערכים או תחזית"
        },
        justify: {
          "settled-by-evidence": function () {
            return "כל הטענות כאן ניתנות לבדיקה מול עובדות.";
          },
          partially: function () {
            return "חלק מהטענות כאן ניתנות לבדיקה עובדתית, וחלקן הן שיפוט ערכי או תחזית.";
          },
          "values-or-prediction": function () {
            return "הטענות כאן הן שיפוט ערכי או תחזית לגבי העתיד, לא עובדות שניתן לבדוק כעת.";
          }
        }
      },
      evidenceStrength: {
        name: "עוצמת הראיות",
        levels: {
          strong: "חזקה",
          "mixed-or-thin": "מעורבת או דלה",
          "none-found": "לא נמצאו ראיות",
          "not-applicable": "לא רלוונטי"
        },
        justify: {
          strong: function () {
            return "החיפוש מצא מקורות אמינים עבור כל הטענות הניתנות לבדיקה.";
          },
          "mixed-or-thin": function () {
            return "החיפוש מצא מקורות עבור חלק מהטענות בלבד, או מקורות מעטים.";
          },
          "none-found": function () {
            return "החיפוש לא מצא מקורות אמינים עבור הטענות הניתנות לבדיקה.";
          },
          "not-applicable": function () {
            return "אין כאן טענות עובדתיות שניתן לבדוק מול מקורות.";
          }
        }
      },
      precision: {
        name: "דיוק",
        levels: {
          "specific-and-falsifiable": "ספציפית וניתנת להפרכה",
          "somewhat-vague": "מעורפלת במידה מסוימת",
          unfalsifiable: "לא ניתנת להפרכה"
        },
        justify: {
          "specific-and-falsifiable": function () {
            return "מדובר בטענה עובדתית בודדת וממוקדת.";
          },
          "somewhat-vague": function () {
            return "הקלט כלל כמה טענות, או ניסוח פחות ממוקד.";
          },
          unfalsifiable: function () {
            return "הטענות כאן מבוססות על ערכים, ולא ניתנות להפרכה עובדתית.";
          }
        }
      },
      analysisConfidence: {
        name: "ביטחון הניתוח",
        levels: { high: "גבוהה", medium: "בינונית", low: "נמוכה" },
        justify: {
          high: function () {
            return "הניתוח בטוח בהערכה של כל הטענות.";
          },
          medium: function () {
            return "הביטחון בהערכה משתנה בין הטענות.";
          },
          low: function () {
            return "לפחות טענה אחת נותרה עם ביטחון נמוך.";
          }
        }
      }
    },
    history: {
      toggle: "היסטוריה",
      empty: "עדיין אין היסטוריה.",
      clear: "נקה היסטוריה",
      restore: "הצג שוב",
      confirmClear: "למחוק את כל ההיסטוריה? אי אפשר לשחזר את זה.",
      privacyNote: "ההיסטוריה נשמרת רק במכשיר ובדפדפן הזה — שום דבר לא נשלח או נשמר בשרת.",
      relative: {
        justNow: "הרגע",
        minutes: function (n) {
          return n === 1 ? "לפני דקה" : "לפני " + n + " דקות";
        },
        hours: function (n) {
          return n === 1 ? "לפני שעה" : "לפני " + n + " שעות";
        },
        days: function (n) {
          return n === 1 ? "אתמול" : "לפני " + n + " ימים";
        },
        older: function (dateStr) {
          return "בתאריך " + dateStr;
        }
      }
    },
    errors: {
      bad_request: "יש לבדוק את הטענה שהזנתם (חסרה או ארוכה מדי) ולנסות שוב.",
      rate_limited: "חרגתם ממכסת הבקשות בשכבה החינמית. המתינו רגע ונסו שוב.",
      model_overloaded: "השירות עמוס כרגע. המתינו רגע ונסו שוב.",
      server_misconfigured: "השרת אינו מוגדר כראוי (חסר מפתח API).",
      upstream_unreachable: "לא ניתן היה להתחבר לשירות הניתוח.",
      network_error: "בעיית רשת: לא ניתן היה להתחבר לשרת.",
      generic: "משהו השתבש בניתוח הטענה. נסו שוב.",
      file_too_large: "התמונה גדולה מדי (עד כ-4MB). נסו צילום מסך קטן יותר.",
      unsupported_file_type: "נתמכות רק תמונות מסוג PNG, JPEG או WEBP.",
      unreadable_image: "לא ניתן היה לקרוא את קובץ התמונה. נסו קובץ אחר.",
      no_claim_found: "לא נמצאה טענה או אמירה ברורה בתמונה הזו.",
      extraction_failed: "לא הצלחנו לקרוא את התמונה כרגע. נסו שוב, או הקלידו את הטענה ישירות."
    },
    disclaimer: "הדגמה בלבד — לא כלי בדיקת עובדות אמיתי."
  },

  en: {
    dir: "ltr",
    htmlLang: "en",
    dateLocale: "en-US",
    header: {
      title: "Claim Breakdown",
      subtitle: "Paste a claim, a promise, or a whole paragraph — we'll break it down and check each part."
    },
    chips: [
      { claim: "Coffee is bad for your health." },
      { claim: "Remote work will become the default for most office jobs by 2030." },
      { claim: "This new law is the right way to fix the housing crisis." }
    ],
    input: {
      label: "Your claim",
      placeholder: "Paste or type a claim, a promise, or a whole paragraph...",
      analyzeIdle: "Break it down",
      analyzeWithImageIdle: "Read the image",
      phaseTriage: "Breaking down the claim...",
      phaseEvidence: "Checking sources...",
      extractPhase: "Reading image..."
    },
    image: {
      attachButton: "Add image",
      hint: "You can also paste, drop, or upload a screenshot of the claim.",
      removeButton: "Remove image",
      previewAlt: "Attached image preview",
      extractPrompt: "Is this the claim? Edit if needed, then press the button again to analyze."
    },
    confidence: {
      label: "Confidence:"
    },
    verdict: {
      overallLabel: "Overall verdict",
      noResult: "None of the claims could be analyzed."
    },
    claim: {
      errorMessage: "Analysis of this claim failed. This may be temporary — try again.",
      relatedPremises: "Related factual premises:",
      notSourceChecked: "Not source-checked — general-knowledge assessment only.",
      sources: function (n) {
        return n === 0 ? "Sources" : "Sources (" + n + ")";
      },
      noSources: "No sources found."
    },
    sections: {
      whatWouldChangeAssessment: "What could change this",
      evidenceSummary: "Evidence summary",
      denominatorCheck: "Compared to what?",
      precisionCheck: "How precise is this claim?",
      alternativeExplanations: "Alternative explanations",
      correlationCaution: "Correlation vs. causation",
      distinguishingEvidence: "What would distinguish these",
      referenceClassAndBaseRate: "Similar past cases",
      feasibility: "Is this feasible?",
      tension: "Values in tension",
      steelman: "Steelman: strongest fair version",
      strawmanWarning: "Strawman to watch for"
    },
    badges: {
      type: {
        Empirical: "Empirical",
        Causal: "Causal",
        "Prediction-or-promise": "Prediction or promise",
        Normative: "Normative",
        Mixed: "Mixed"
      },
      assessment: {
        Supported: "Supported",
        "Mostly supported": "Mostly supported",
        "Mixed or context-dependent": "Mixed or context-dependent",
        Contradicted: "Contradicted",
        "Not enough information": "Not enough information",
        "Not empirically assessable": "Not empirically assessable",
        "Too recent to assess": "Too recent to assess",
        "Outcome not yet knowable": "Outcome not yet knowable"
      },
      confidence: {
        Low: "Low",
        Medium: "Medium",
        High: "High"
      },
      sourceTier: {
        "Primary official": "Primary official",
        Academic: "Academic",
        "Established journalism": "Established journalism",
        "Fact-check org": "Fact-check org",
        Other: "Other"
      }
    },
    epistemicProfile: {
      checkability: {
        name: "Checkability",
        levels: {
          "settled-by-evidence": "Settled by evidence",
          partially: "Partially",
          "values-or-prediction": "Values or prediction"
        },
        justify: {
          "settled-by-evidence": function () {
            return "Every claim here is checkable against facts.";
          },
          partially: function () {
            return "Some claims here are empirically checkable; others are values or predictions.";
          },
          "values-or-prediction": function () {
            return "The claims here are value judgments or predictions about the future, not currently-checkable facts.";
          }
        }
      },
      evidenceStrength: {
        name: "Evidence strength",
        levels: {
          strong: "Strong",
          "mixed-or-thin": "Mixed or thin",
          "none-found": "None found",
          "not-applicable": "Not applicable"
        },
        justify: {
          strong: function () {
            return "Search found credible sources for every checkable claim.";
          },
          "mixed-or-thin": function () {
            return "Search found sources for only some claims, or thin support.";
          },
          "none-found": function () {
            return "Search found no credible sources for the checkable claims.";
          },
          "not-applicable": function () {
            return "There are no empirical claims here to check against sources.";
          }
        }
      },
      precision: {
        name: "Precision",
        levels: {
          "specific-and-falsifiable": "Specific and falsifiable",
          "somewhat-vague": "Somewhat vague",
          unfalsifiable: "Unfalsifiable"
        },
        justify: {
          "specific-and-falsifiable": function () {
            return "This is a single, focused factual claim.";
          },
          "somewhat-vague": function () {
            return "The input contained multiple claims, or less tightly-focused wording.";
          },
          unfalsifiable: function () {
            return "The claims here rest on values, not something factually falsifiable.";
          }
        }
      },
      analysisConfidence: {
        name: "Analysis confidence",
        levels: { high: "High", medium: "Medium", low: "Low" },
        justify: {
          high: function () {
            return "The analysis is confident across every claim.";
          },
          medium: function () {
            return "Confidence in the assessment varies across claims.";
          },
          low: function () {
            return "At least one claim's assessment remains low-confidence.";
          }
        }
      }
    },
    history: {
      toggle: "History",
      empty: "No history yet.",
      clear: "Clear history",
      restore: "Show again",
      confirmClear: "Delete all history? This can't be undone.",
      privacyNote: "History is stored only on this device and browser — nothing is sent to or saved on any server.",
      relative: {
        justNow: "Just now",
        minutes: function (n) {
          return n === 1 ? "1 minute ago" : n + " minutes ago";
        },
        hours: function (n) {
          return n === 1 ? "1 hour ago" : n + " hours ago";
        },
        days: function (n) {
          return n === 1 ? "Yesterday" : n + " days ago";
        },
        older: function (dateStr) {
          return "on " + dateStr;
        }
      }
    },
    errors: {
      bad_request: "Please check your claim text (missing or too long) and try again.",
      rate_limited: "You're sending requests too fast for the free tier. Wait a moment and try again.",
      model_overloaded: "The analysis service is under heavy load right now. Wait a moment and try again.",
      server_misconfigured: "The server isn't configured correctly (missing API key).",
      upstream_unreachable: "Couldn't reach the analysis service.",
      network_error: "Network problem: couldn't reach the server.",
      generic: "Something went wrong analyzing that claim. Try again.",
      file_too_large: "This image is too large (max ~4MB). Try a smaller screenshot.",
      unsupported_file_type: "Only PNG, JPEG, or WEBP images are supported.",
      unreadable_image: "Couldn't read that image file. Try a different one.",
      no_claim_found: "No clear claim or statement was found in this image.",
      extraction_failed: "Couldn't read the image right now. Try again, or type the claim directly."
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
