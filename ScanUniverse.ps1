# ScanUniverse.ps1
# This script scans the website repository to generate a 3D universe data map and a sitemap.xml for SEO.

$root = $PSScriptRoot
$jsonPath = Join-Path $root "public\MiniProjects\Universe\universe-data.json"
$sitemapPath = Join-Path $root "public\sitemap.xml"
$baseUrl = "https://dillonsimeone.com" 

# Directories to ignore
$excludeDirs = @(".git", "node_modules", "dist", ".vscode", ".gemini", "venv", ".venv", ".pio")

function Get-RepoStructure {
    param($dir, $depth = 0)
    # Get items, ignoring hidden files and excluded directories
    $items = Get-ChildItem -Path $dir -Force | Where-Object { 
        $_.Name -notin $excludeDirs -and $_.Name -notmatch "^\."
    }
    
    $result = @()
    foreach ($item in $items) {
        $entry = [PSCustomObject]@{
            name = $item.Name
            path = $item.FullName.Replace($root, "").Replace("\", "/")
            type = if ($item.PSIsContainer) { "dir" } else { "file" }
            size = if ($item.PSIsContainer) { 0 } else { $item.Length }
            depth = $depth
            ext = if ($item.PSIsContainer) { "" } else { $item.Extension.ToLower() }
        }
        
        # Recursively scan directories
        if ($item.PSIsContainer) {
            $entry | Add-Member -MemberType NoteProperty -Name "children" -Value (Get-RepoStructure $item.FullName ($depth + 1))
        }
        $result += $entry
    }
    return $result
}

Write-Host "--- Universe Scanner ---" -ForegroundColor Cyan
Write-Host "Scanning repository structure..." -ForegroundColor Gray
$structure = Get-RepoStructure $root
# Convert to JSON with very high depth to ensure deep nesting is captured
$structure | ConvertTo-Json -Depth 100 | Out-File $jsonPath -Encoding utf8

Write-Host "Generating sitemap.xml for SEO..." -ForegroundColor Gray
$sitemapHeader = '<?xml version="1.0" encoding="UTF-8"?>' + "`n" + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
$sitemapFooter = '</urlset>'
$urls = @()

# Add the main root page
$urls += "  <url><loc>$baseUrl/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>"

# Find all HTML files in public/ and root src/
# We ignore source content fragments and partials
$excludePattern = "([\\/]\.git[\\/]|[\\/]node_modules[\\/]|[\\/]dist[\\/]|[\\/]src[\\/](content|partials|_includes)[\\/])"
$htmlFiles = Get-ChildItem -Path $root -Recurse -Filter "*.html" | Where-Object {
    $_.FullName -notmatch $excludePattern
}

Write-Host "Found $($htmlFiles.Count) public HTML files." -ForegroundColor Gray
foreach ($f in $htmlFiles) {
    $relPath = $f.FullName.Replace($root, "").Replace("\", "/")
    if (!$relPath.StartsWith("/")) { $relPath = "/" + $relPath }
    
    # deployment logic: 'public/' is served as root
    $urlPath = $relPath -replace "^/public/", "/"
    
    # Skip the source index as it's already handled as root
    if ($urlPath -eq "/src/index.html") { continue }
    
    # Clean up paths: /Projects/MyProject/index.html -> /Projects/MyProject/
    $urlPath = $urlPath -replace "/index.html$", "/"
    
    # Avoid duplicate root entry if it exists in public/
    if ($urlPath -eq "/") { continue }

    Write-Host "  + Adding to sitemap: $urlPath" -ForegroundColor DarkGray
    $urls += "  <url><loc>$baseUrl$urlPath</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>"
}

$sitemapContent = $sitemapHeader + "`n" + ($urls -join "`n") + "`n" + $sitemapFooter
$sitemapContent | Out-File $sitemapPath -Encoding utf8

Write-Host "[✔] Success! Data saved to:" -ForegroundColor Green
Write-Host "  -> JSON: $jsonPath"
Write-Host "  -> XML:  $sitemapPath"
Write-Host "------------------------"
