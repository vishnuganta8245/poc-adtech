# ── EventLens Full Deploy Script ──────────────────────────────────────
# Run once after every sandbox reset.
# Usage (from project root): .\deploy.ps1
# ──────────────────────────────────────────────────────────────────────

$STACK_NAME = "event-backend"
$REGION     = "us-east-1"
$USERNAME   = "vish@email.com"
$PASSWORD   = "EventLens@123"

# ── Step 1: SAM Build + Deploy ─────────────────────────────────────────
Write-Host "`n=== Step 1: SAM Build + Deploy ===" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend\event-backend"
sam build
sam deploy --no-confirm-changeset --region $REGION

# ── Step 2: Get Stack Outputs ──────────────────────────────────────────
Write-Host "`n=== Step 2: Fetching Stack Outputs ===" -ForegroundColor Cyan
$outputs = aws cloudformation describe-stacks `
  --stack-name $STACK_NAME `
  --region $REGION `
  --query "Stacks[0].Outputs" `
  --output json | ConvertFrom-Json

function Get-Output($key) {
  ($outputs | Where-Object { $_.OutputKey -eq $key }).OutputValue
}

$EVENTS_API  = Get-Output "EventsApi"
$METRICS_API = Get-Output "MetricsApi"
$WS_URL      = Get-Output "WebSocketURL"
$DASH_BUCKET = Get-Output "EventDashboardBucketName"
$GEN_BUCKET  = Get-Output "EventGeneratorBucketName"
$DASH_URL    = Get-Output "EventDashboardURL"
$GEN_URL     = Get-Output "EventGeneratorURL"
$POOL_ID     = Get-Output "UserPoolId"
$CLIENT_ID   = Get-Output "UserPoolClientId"

Write-Host "  Events API  : $EVENTS_API"
Write-Host "  Metrics API : $METRICS_API"
Write-Host "  WebSocket   : $WS_URL"
Write-Host "  Pool ID     : $POOL_ID"
Write-Host "  Client ID   : $CLIENT_ID"

# ── Step 3: Create User ────────────────────────────────────────────────
Write-Host "`n=== Step 3: Create User ===" -ForegroundColor Cyan
aws cognito-idp admin-create-user `
  --user-pool-id $POOL_ID `
  --username $USERNAME `
  --user-attributes Name=email,Value=$USERNAME Name=email_verified,Value=true `
  --temporary-password "Temp@1234" `
  --message-action SUPPRESS `
  --region $REGION 2>&1 | Out-Null

aws cognito-idp admin-set-user-password `
  --user-pool-id $POOL_ID `
  --username $USERNAME `
  --password $PASSWORD `
  --permanent `
  --region $REGION 2>&1 | Out-Null

Write-Host "  User ready  : $USERNAME / $PASSWORD"

# ── Step 4: Update .env files ──────────────────────────────────────────
Write-Host "`n=== Step 4: Updating .env files ===" -ForegroundColor Cyan

Set-Content -Path "$PSScriptRoot\event-dashboard\.env" -Encoding utf8 -Value @"
VITE_METRICS_URL=$METRICS_API
VITE_WS_URL=$WS_URL
VITE_COGNITO_USER_POOL_ID=$POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
"@
Write-Host "  event-dashboard/.env updated"

Set-Content -Path "$PSScriptRoot\event-generator\.env" -Encoding utf8 -Value @"
VITE_API_URL=$EVENTS_API
"@
Write-Host "  event-generator/.env updated"

# ── Step 5: Build & Deploy Dashboard ──────────────────────────────────
Write-Host "`n=== Step 5: Build & Deploy Dashboard ===" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\event-dashboard"
npm install
npm run build
aws s3 sync dist/ "s3://$DASH_BUCKET" --delete
Write-Host "  Dashboard deployed"

# ── Step 6: Build & Deploy Generator ──────────────────────────────────
Write-Host "`n=== Step 6: Build & Deploy Event Generator ===" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\event-generator"
npm install
npm run build
aws s3 sync dist/ "s3://$GEN_BUCKET" --delete
Write-Host "  Generator deployed"

# ── Step 7: Invalidate CloudFront Caches ──────────────────────────────
Write-Host "`n=== Step 7: Invalidating CloudFront Caches ===" -ForegroundColor Cyan
$dists = aws cloudfront list-distributions `
  --query "DistributionList.Items[*].{Id:Id,Domain:DomainName}" `
  --output json | ConvertFrom-Json

foreach ($dist in $dists) {
  $url = "https://" + $dist.Domain
  if ($url -eq $DASH_URL -or $url -eq $GEN_URL) {
    aws cloudfront create-invalidation --distribution-id $dist.Id --paths "/*" | Out-Null
    Write-Host "  Cache cleared: $($dist.Domain)"
  }
}

# ── Done ───────────────────────────────────────────────────────────────
Write-Host "`n=====================================" -ForegroundColor Green
Write-Host "        DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard (login required) : $DASH_URL"
Write-Host "  Event Generator            : $GEN_URL"
Write-Host "  Login credentials          : $USERNAME / $PASSWORD"
Write-Host ""
Set-Location $PSScriptRoot
