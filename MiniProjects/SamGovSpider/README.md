# SamGovSpider

An automated data crawler and interactive explorer built to retrieve and browse public data extracts from the SAM.gov contract opportunities directory.

## Features
1. **File Extracts Browser (`index.html`)**: A comic-styled directory browser to explore the folder structure of SAM.gov's data services.
2. **Active Opportunities Explorer (`targeted.html`)**: A searchable, paginated explorer that displays all active contract opportunities (75,000+ entries) in beautiful comic-styled cards.
3. **Weekly Automation (`run.bat`)**: Executes both backend python scripts to keep local copies of the databases current.

---

## How It Works (Technical Overview)

### 1. Directory Crawler (`sam_gov_spider.py`)
Queries the internal unauthenticated SAM.gov directory listing API:
```
https://sam.gov/api/prod/fileextractservices/v1/api/listfiles?domain={domain}&privacy=Public
```
* **Traversal:** It starts at the root `Contract Opportunities` and does a recursive traversal. If a key ends in `/` (e.g. `historical/`), it strips the trailing slash and queries it as the next domain.
* **Result:** Stores the complete folder hierarchy and file metadata in `sam_gov_data.json`.

### 2. Daily CSV Downloader & Parser (`download_datagov.py`)
SAM.gov's application server returns a `500` error on python-based download requests if a browser-acknowledgement session cookie is missing. However, the backing AWS S3 bucket itself is completely public and allows direct downloads.
* **Target:** It streams the daily full snapshot CSV directly from:
  ```
  https://s3.amazonaws.com/falextracts/Contract Opportunities/datagov/ContractOpportunitiesFullCSV.csv
  ```
* **Memory-Safe Processing:** It downloads the 230MB CSV file and parses it line-by-line using Python's native `csv.DictReader` to prevent high memory usage.
* **Extraction:** Filters and outputs key fields (Title, Solicitation #, Posted Date, Type, Agency, Office, Link, and truncated Description) into `datagov_opportunities.json` (~40MB, 75,000+ records) sorted with the newest listings first.

---

## S3 Link Trust & Data Authenticity
* **Ownership:** The `falextracts` S3 bucket is the official bulk extracts bucket owned and managed by the **U.S. General Services Administration (GSA)** / **IAE (Integrated Award Environment)**.
* **Data Authenticity:** The files downloaded directly from the S3 link are identical to those generated and served through the official SAM.gov Data Services UI. Direct downloads simply bypass front-end browser redirects and authentication checks.
