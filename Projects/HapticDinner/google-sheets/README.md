# Google Sheets & Email Dispatcher Setup

This directory contains the automation bridge for the **Haptic Dinner Series (Dec 12, 2026)** connecting the website reservation form to your Google Sheet (`hapticDinnerCymaSpaceDec12`) and sending confirmation emails from your CymaSpace account.

---

## 1. Google Sheet Column Headers

Open your Google Spreadsheet:
`https://docs.google.com/spreadsheets/d/1XPPCxzB-hg8ui8ad0ehVn9WFU_6EAYxOgAq_j6MPSj8/edit?gid=0#gid=0`

Ensure row 1 has these exact column headers (in order from Column A to K):
1. **Timestamp** (A)
2. **Confirmation Code** (B)
3. **Full Name** (C)
4. **Email** (D)
5. **Seats** (E)
6. **Ticket Tier** (F)
7. **Dietary** (G)
8. **ASL Needed** (H)
9. **Wheelchair Access** (I)
10. **Notes** (J)
11. **Email Status** (K)

*(Note: If the sheet is empty, the Apps Script will automatically generate these headers on the very first submission).*

---

## 2. Deploy the Google Apps Script Web App (1-Minute Setup)

Because Google restricts anonymous writes with client-side API keys, a tiny Google Apps Script Web App receives the form submissions and appends them to your sheet.

1. In your spreadsheet, click: **Extensions > Apps Script**.
2. Clear any default code in `Code.gs`, and paste the contents of [`Code.gs`](Code.gs).
3. Click the blue **Deploy** button (top right) > **New deployment**.
4. Configure:
   - **Select type**: Click the gear icon > select **Web app**.
   - **Description**: `Haptic Dinner RSVP Webhook`
   - **Execute as**: `Me` (your Google/CymaSpace account)
   - **Who has access**: `Anyone`
5. Click **Deploy** and authorize permissions when prompted.
6. Copy the **Web App URL** (which ends in `/exec`).
7. Open `public/Projects/HapticDinner/script.js` and paste your URL into:
   ```javascript
   GOOGLE_CONFIG.appsScriptWebAppUrl = 'https://script.google.com/macros/s/.../exec';
   ```

Now, whenever a guest submits an RSVP on `ticket.html`:
- The submission appends directly as a new row in your spreadsheet.
- The remaining seat counter updates dynamically in real-time.

---

## 3. Sending Confirmation Emails from CymaSpace Gmail

You can run the Python script to inspect or send emails to all attendees with a status of `Pending`:

### Test / Dry-Run (No emails sent):
```bash
python send_haptic_dinner_emails.py --dry-run
```

### Live Send via your CymaSpace Gmail:
```bash
python send_haptic_dinner_emails.py --email yourname@cymaspace.org --password "your-app-password"
```
*(Tip: In your Google Account, enable 2-Step Verification and generate an "App Password" to allow Python SMTP access without exposing your main password).*
