# Update Supabase Database Password in .env
# Run this after resetting your password in Supabase Dashboard

Write-Host "`n=== Supabase Database Password Updater ===" -ForegroundColor Cyan
Write-Host "This will update your .env file with the new database password`n" -ForegroundColor Yellow

# Get the new password
$newPassword = Read-Host -Prompt "Enter your new Supabase database password"

if ([string]::IsNullOrWhiteSpace($newPassword)) {
    Write-Host "Error: Password cannot be empty" -ForegroundColor Red
    exit 1
}

# URL encode the password (handle special characters like $, @, etc.)
Add-Type -AssemblyName System.Web
$encodedPassword = [System.Web.HttpUtility]::UrlEncode($newPassword)

# Build the connection strings
$DATABASE_URL = "postgresql://postgres.ntkegkbhvgltdcfoakyk:$encodedPassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
$DIRECT_URL = "postgresql://postgres:$encodedPassword@db.ntkegkbhvgltdcfoakyk.supabase.co:5432/postgres"

Write-Host "`nNew connection strings generated:" -ForegroundColor Green
Write-Host "DATABASE_URL=$DATABASE_URL" -ForegroundColor Gray
Write-Host "DIRECT_URL=$DIRECT_URL" -ForegroundColor Gray

# Read current .env file
$envPath = ".\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "`nError: .env file not found at $envPath" -ForegroundColor Red
    exit 1
}

$envContent = Get-Content $envPath -Raw

# Update DATABASE_URL
$envContent = $envContent -replace 'DATABASE_URL=postgresql://[^\r\n]+', "DATABASE_URL=$DATABASE_URL"

# Update DIRECT_URL
$envContent = $envContent -replace 'DIRECT_URL=postgresql://[^\r\n]+', "DIRECT_URL=$DIRECT_URL"

# Update PGPASSWORD
$envContent = $envContent -replace 'PGPASSWORD=.+', "PGPASSWORD=$newPassword"

# Write back to .env
Set-Content -Path $envPath -Value $envContent -NoNewline

Write-Host "`n✓ Successfully updated .env file!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Stop the dev server if running (Ctrl+C)" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Test login at: http://localhost:5000" -ForegroundColor White
