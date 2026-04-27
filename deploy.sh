#!/bin/bash
set -e

STACK_NAME="event-backend"
BACKEND_DIR="backend/event-backend"

echo ""
echo "======================================"
echo " STEP 1: Deploy backend (SAM)"
echo "======================================"
cd $BACKEND_DIR
sam build
sam deploy
cd ../..

echo ""
echo "======================================"
echo " STEP 2: Reading outputs"
echo "======================================"
EVENTS_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query "Stacks[0].Outputs[?OutputKey=='EventsApi'].OutputValue" --output text)

METRICS_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query "Stacks[0].Outputs[?OutputKey=='MetricsApi'].OutputValue" --output text)

GENERATOR_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query "Stacks[0].Outputs[?OutputKey=='EventGeneratorBucketName'].OutputValue" --output text)

DASHBOARD_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query "Stacks[0].Outputs[?OutputKey=='EventDashboardBucketName'].OutputValue" --output text)

GENERATOR_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query "Stacks[0].Outputs[?OutputKey=='EventGeneratorURL'].OutputValue" --output text)

DASHBOARD_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query "Stacks[0].Outputs[?OutputKey=='EventDashboardURL'].OutputValue" --output text)

WS_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query "Stacks[0].Outputs[?OutputKey=='WebSocketURL'].OutputValue" --output text)

echo "Events API   : $EVENTS_URL"
echo "Metrics API  : $METRICS_URL"
echo "WebSocket URL: $WS_URL"
echo "Gen Bucket   : $GENERATOR_BUCKET"
echo "Dash Bucket  : $DASHBOARD_BUCKET"

echo ""
echo "======================================"
echo " STEP 3: Updating URLs in source files"
echo "======================================"
# Update event-generator API URL
sed -i "s|const API_URL = \".*\"|const API_URL = \"$EVENTS_URL\"|" event-generator/src/App.jsx
echo "Updated event-generator/src/App.jsx"

# Update dashboard .env
printf "VITE_METRICS_URL=%s\nVITE_WS_URL=%s\n" "$METRICS_URL" "$WS_URL" > event-dashboard/.env
echo "Updated event-dashboard/.env"

echo ""
echo "======================================"
echo " STEP 4: Build + upload Event Dashboard"
echo "======================================"
cd event-dashboard
npm run build
aws s3 sync dist/ s3://$DASHBOARD_BUCKET --delete
cd ..

echo ""
echo "======================================"
echo " STEP 5: Build + upload Event Generator"
echo "======================================"
cd event-generator
npm run build
aws s3 sync dist/ s3://$GENERATOR_BUCKET --delete
cd ..

echo ""
echo "======================================"
echo " ALL DONE"
echo "======================================"
echo ""
echo "  Generator : $GENERATOR_URL"
echo "  Dashboard : $DASHBOARD_URL"
echo ""
