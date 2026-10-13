# BIZVIORA Landing Lead Intake — Google Sheets integration contract
Status: DESIGN / NOT LIVE (2026-10-12)
Confirmed destination spreadsheet ID: 1iUci1yByxSIa5aQEFnglV4bHVxhaTRmhjwfhgbQOkWE
Tab: LEADS; verified first row columns A:T.
Authority: BIZVIORA Lead Intake & Attribution SOP V1, Google Doc 1bXOD9IRXptze80wXYZ7Ly4VNUUwLR0puoq8eFXjQG-w.

## Frontend -> trusted backend POST /api/public/lead
Body (JSON): business_name (1-120 chars), business_type (enum homestay/cafe/restaurant/other), contact_name (1-80), phone OR email, urgent_pain (1-1000), consent: true, consent_version: "lead-v1-20261012", form_started_at and honeypot (empty), optional source/utm fields. Never send Google token, service-account secret or spreadsheet writer credential to the browser. No account/login required.
Backend: restrict Origin to bizviora.com, check CSRF and bot mitigation, server-side rate limit (IP hashed and short retention), normalize and validate, cap request bytes, reject URL spam and formula injection (prefix dangerous = + - @ values before writing cells), generate UUID and UTC timestamp, append A:T via scoped Google Sheets credential stored ONLY in secret manager. Default status NEW, owner/next action empty. On writer failure return neutral 503, do not claim success. Avoid logging PII or credentials; return request ID only.
Privacy: visible explicit opt-in unchecked by default; purpose "BIZVIORA liên hệ để trao đổi về vấn đề vận hành và thông tin thử nghiệm"; link to privacy notice with controller/contact/retention/deletion request; no marketing automation without separate consent. Access owner-only until access review. No customer data from TUAN OS production.
Success: only after a confirmed Sheets append, no duplicate on retry with idempotency key. Test negative cases, 429, 503, XSS, CSRF, consent false, cross-origin, formula injection. Verify synthetic row appended and read back then remove test row via approved process.
Do not publish endpoint until acceptance gates pass; current landing form remains inert and clearly labeled demo.
