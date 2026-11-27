#!/usr/bin/env python3
"""
Haptic Dinner Series: Confirmation Email Dispatcher
Reads the Google Sheet (hapticDinnerCymaSpaceDec12), finds reservations marked 'Pending',
and sends an official CymaSpace confirmation email with their reservation code and details.

Usage:
  # Dry-run (inspect emails in console without sending):
  python send_haptic_dinner_emails.py --dry-run

  # Live send via CymaSpace Gmail SMTP:
  python send_haptic_dinner_emails.py --email yourname@cymaspace.org --password "your-app-password"
"""

import sys
import argparse
import smtplib
import ssl
import json
import urllib.request
import urllib.parse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Ensure UTF-8 output on all Windows console code pages
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SPREADSHEET_ID = "1XPPCxzB-hg8ui8ad0ehVn9WFU_6EAYxOgAq_j6MPSj8"
API_KEY = "AIzaSyCzQjEsxt2BstQ-Z45rytlj0Bj_jpAoSpw"
SHEET_NAME = "Sheet1"

def fetch_sheet_rows():
    """Fetch all rows from the Google Sheet via the Sheets v4 API."""
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{urllib.parse.quote(SHEET_NAME)}!A1:K?key={API_KEY}"
    
    req = urllib.request.Request(url, headers={
        "Referer": "https://dillonsimeone.com/"
    })
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get("values", [])
    except Exception as e:
        print(f"Error reading Google Sheets API: {e}", file=sys.stderr)
        return []

def build_email_body(row_data):
    """Build accessible plain text and HTML confirmation email."""
    # Row structure: [0:Timestamp, 1:Code, 2:Name, 3:Email, 4:Seats, 5:Tier, 6:Dietary, 7:ASL, 8:Wheelchair, 9:Notes, 10:Status]
    code = row_data[1] if len(row_data) > 1 else "HD-XXXX"
    name = row_data[2] if len(row_data) > 2 else "Guest"
    email = row_data[3] if len(row_data) > 3 else ""
    seats = row_data[4] if len(row_data) > 4 else "1"
    tier = row_data[5] if len(row_data) > 5 else "Combined Experience ($80)"
    dietary = row_data[6] if len(row_data) > 6 else "Omnivore"
    asl = row_data[7] if len(row_data) > 7 else "No"

    text_body = f"""Hello {name},

Your seat reservation for the Haptic Dinner Series is confirmed!

RESERVATION DETAILS:
• Confirmation Code: {code}
• Party Size: {seats} Seat(s)
• Selected Tier: {tier}
• Dietary Preference: {dietary}
• ASL Requested: {asl}

EVENT INFORMATION:
• Date: Saturday, December 12, 2026
• Doors Open & Vest Fitting: 5:00 PM
• Performance & Dinner: 5:15 PM – 7:00 PM
• Venue: CymaSpace (Woodstock Cafe), 4103 SE Woodstock Blvd, Portland, OR 97202

HOW PAYMENT WORKS:
Ticket payment is completed in-person at the CymaSpace cafe kiosk when you arrive.
Please show this email or present your confirmation code ({code}) at check-in.

FEATURING:
• Live sub-bass electronic set by DJwish (Nate Hergert)
• Sound-reactive visual environment & audio-haptic vest integration
• Curated multi-course dinner by Chef Andre Grey
• First public hands-on preview of The Haptic Petting Zoo prototype hardware

If you need to make changes or have questions, simply reply to this email.

Warm regards,
CymaSpace, Woodstock Cafe & Control+H
https://cymaspace.github.io/Website/ | https://pdxhackerspace.org/
"""

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 20px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: #0b0d1a; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid #00e5ff;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #ffb703; text-transform: uppercase; margin-bottom: 4px;">CYMASPACE &bull; WOODSTOCK CAFE &bull; CONTROL+H</div>
      <h1 style="font-size: 22px; margin: 0; font-weight: 800;">Haptic Dinner Series</h1>
      <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Saturday, December 12, 2026 &bull; Portland, Oregon</div>
    </div>
    
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Reservation Confirmed</h2>
      <p>Hello {name},</p>
      <p>Your seat has been successfully reserved for our intimate multisensory dinner and music showcase.</p>

      <div style="background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.05em;">Confirmation Code</div>
        <div style="font-size: 26px; font-weight: 900; color: #0284c7; font-family: monospace; margin: 4px 0 12px;">{code}</div>
        <div style="font-size: 14px; line-height: 1.6;">
          <div><strong>Seats Held:</strong> {seats} Seat(s)</div>
          <div><strong>Ticket Tier:</strong> {tier}</div>
          <div><strong>Dietary:</strong> {dietary}</div>
          <div><strong>ASL Requested:</strong> {asl}</div>
        </div>
      </div>

      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 20px; font-size: 13px;">
        <strong>Kiosk Payment on Arrival:</strong><br>
        Payment will be finalized directly at the CymaSpace cafe kiosk when you check in on Dec 12. Please have your confirmation code ready.
      </div>

      <h3 style="font-size: 15px; margin-bottom: 8px;">Event Flow &bull; Saturday, Dec 12:</h3>
      <ul style="font-size: 13px; padding-left: 20px; margin: 0 0 20px; color: #334155;">
        <li><strong>5:00 PM:</strong> Doors open, vest fitting &amp; sensory calibration</li>
        <li><strong>5:15 PM:</strong> Live sub-bass electronic performance by DJwish (Nate Hergert) &amp; reactive visuals</li>
        <li><strong>6:00 PM:</strong> Multi-course dinner by Chef Andre Grey &amp; Haptic Petting Zoo hands-on social hour</li>
        <li><strong>7:00 PM:</strong> Event concludes</li>
      </ul>

      <p style="font-size: 13px; color: #64748b;">
        Venue: CymaSpace (Woodstock Cafe), 4103 SE Woodstock Blvd, Portland, OR 97202.<br>
        Questions or dietary adjustments? Simply reply to this email.
      </p>
    </div>

    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
      Haptic Dinner Series &copy; 2026 CymaSpace, Woodstock Cafe &amp; Control+H
    </div>
  </div>
</body>
</html>
"""
    return text_body, html_body

def main():
    parser = argparse.ArgumentParser(description="Send Haptic Dinner reservation confirmation emails via CymaSpace Gmail.")
    parser.add_argument("--dry-run", action="store_true", help="Print email contents without sending.")
    parser.add_argument("--email", help="Sender CymaSpace Gmail address (e.g. info@cymaspace.org)")
    parser.add_argument("--password", help="Gmail App Password for SMTP authentication")
    args = parser.parse_args()

    print("Fetching reservations from Google Sheet...")
    rows = fetch_sheet_rows()

    if not rows or len(rows) <= 1:
        print("No reservation rows found in the sheet (or only header row exists).")
        return

    # Header: rows[0]
    # Data: rows[1:]
    pending_count = 0
    for idx, row in enumerate(rows[1:], start=2):
        status = row[10] if len(row) > 10 else "Pending"
        email = row[3] if len(row) > 3 else ""

        if status.strip().lower() == "pending" and "@" in email:
            pending_count += 1
            code = row[1] if len(row) > 1 else f"ROW-{idx}"
            name = row[2] if len(row) > 2 else "Guest"

            text_body, html_body = build_email_body(row)

            if args.dry_run or not args.email:
                print(f"\n[DRY RUN] Would send confirmation to: {name} <{email}> ({code})")
                print("-" * 50)
                print(text_body[:400] + "...\n[Full HTML formatted]")
                print("-" * 50)
            else:
                print(f"Sending confirmation email to: {name} <{email}> ({code})...")
                msg = MIMEMultipart("alternative")
                msg["Subject"] = f"Reservation Confirmed: Haptic Dinner Series (Dec 12 at CymaSpace) [{code}]"
                msg["From"] = f"CymaSpace Events <{args.email}>"
                msg["To"] = email

                msg.attach(MIMEText(text_body, "plain"))
                msg.attach(MIMEText(html_body, "html"))

                context = ssl.create_default_context()
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                    server.login(args.email, args.password)
                    server.sendmail(args.email, email, msg.as_string())
                print(f"[OK] Sent successfully to {email}")

    if pending_count == 0:
        print("All reservations have already been processed (0 pending).")
    else:
        print(f"\nProcessed {pending_count} pending reservation(s).")

if __name__ == "__main__":
    main()
