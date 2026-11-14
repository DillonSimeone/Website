/**
 * Google Apps Script Web App for Haptic Dinner Series (hapticDinnerCymaSpaceDec12)
 * Handles both READ (doGet) and WRITE (doPost) with built-in Anti-Spam & Security
 *
 * Update Instructions:
 * 1. In your Google Sheet, open: Extensions > Apps Script
 * 2. Replace Code.gs with this updated code
 * 3. Click "Deploy" > "Manage deployments" > Edit (pencil icon) > Version: "New version" > "Deploy"
 */

const MAX_CAPACITY = 20;

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];

    // Optional quick cleanup: ?action=remove_test
    if (e && e.parameter && e.parameter.action === "remove_test") {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRow(2);
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          message: "Test row 2 removed."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var data = sheet.getDataRange().getValues();

    // If sheet is empty or only has header row
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        totalBooked: 0,
        remaining: MAX_CAPACITY
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var totalBooked = 0;
    // Iterate from row 1 (skipping row 0 header)
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      // Column E (index 4) contains seats
      var seats = parseInt(row[4], 10);
      if (!isNaN(seats) && seats > 0) {
        totalBooked += seats;
      } else {
        totalBooked += 1;
      }
    }

    var remaining = Math.max(0, MAX_CAPACITY - totalBooked);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      totalBooked: totalBooked,
      remaining: remaining
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];

    // Initialize header row if sheet is completely blank
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp",
        "Confirmation Code",
        "Full Name",
        "Email",
        "Seats",
        "Ticket Tier",
        "Dietary",
        "ASL Needed",
        "Wheelchair Access",
        "Notes",
        "Email Status"
      ]);
    }

    var data = JSON.parse(e.postData.contents);

    // SECURITY 1: Honeypot check (Bots fill hidden fields, humans never do)
    if (data.hp_check && data.hp_check.trim() !== "") {
      return ContentService.createTextOutput(JSON.stringify({
        status: "dropped",
        message: "Bot submission ignored."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // SECURITY 2: Input sanitization & clamping
    var name = (data.name || "").toString().trim().slice(0, 80);
    var email = (data.email || "").toString().trim().toLowerCase().slice(0, 100);
    var seats = parseInt(data.seats, 10);
    if (isNaN(seats) || seats < 1) seats = 1;
    if (seats > 4) seats = 4; // Max 4 per party

    // Basic email validation
    if (!email || email.indexOf("@") === -1 || email.indexOf(".") === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Valid email required."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // SECURITY 3: Calculate current capacity and enforce hard cap
    var sheetData = sheet.getDataRange().getValues();
    var currentBooked = 0;
    var existingEmails = {};

    for (var i = 1; i < sheetData.length; i++) {
      var s = parseInt(sheetData[i][4], 10);
      currentBooked += (!isNaN(s) && s > 0) ? s : 1;
      var existingEmail = (sheetData[i][3] || "").toString().toLowerCase().trim();
      if (existingEmail) existingEmails[existingEmail] = true;
    }

    // Prevent duplicate spam from same email address
    if (existingEmails[email]) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "A reservation with this email already exists."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Hard capacity cap: reject if seats requested exceed available
    if (currentBooked + seats > MAX_CAPACITY) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Sold out or insufficient seats remaining."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var code = (data.code || ("HD-" + Math.floor(1000 + Math.random() * 9000))).toString().slice(0, 20);
    var tier = (data.tier || "Combined Experience ($80)").toString().slice(0, 60);
    var dietary = (data.dietary || "Omnivore").toString().slice(0, 60);
    var asl = (data.aslNeeded === "Yes" || data.aslNeeded === true) ? "Yes" : "No";
    var wheelchair = (data.wheelchairNeeded === "Yes" || data.wheelchairNeeded === true) ? "Yes" : "No";
    var notes = (data.notes || "").toString().trim().slice(0, 400);

    // Append verified row
    sheet.appendRow([
      new Date().toISOString(),
      code,
      name,
      email,
      seats,
      tier,
      dietary,
      asl,
      wheelchair,
      notes,
      "Pending"
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      code: code
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
