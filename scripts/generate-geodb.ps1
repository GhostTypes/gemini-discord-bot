#!/usr/bin/env pwsh
<#
.SYNOPSIS
    PowerShell wrapper for GeoGuesser database generation
.DESCRIPTION
    Runs the unified GeoGuesser location and image generator with default args: 50 50 50 50
    (50 locations for each difficulty: EASY, MEDIUM, HARD, EXPERT)
.EXAMPLE
    .\scripts\generate-geodb.ps1
#>

Write-Host "🌍 Starting GeoGuesser Database Generation..." -ForegroundColor Green
Write-Host "Target: 50 locations per difficulty (200 total)" -ForegroundColor Yellow
Write-Host ""

# Run the Node.js generator with specified arguments
& node "scripts/generate-geoguesser-complete.js" 50 50 50 50

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ GeoGuesser database generation completed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ GeoGuesser database generation failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}