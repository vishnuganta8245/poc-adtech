# Ad-Tech Event Streaming Pipeline (POC)

A fully serverless AWS proof of concept that generates synthetic ad events, streams them through Kinesis, aggregates metrics in real-time via Lambda, and visualizes live impressions, clicks, and conversions on a web dashboard connected via WebSocket.

## Architecture Overview

```
Stage 1: Event Generation  →  Stage 2: Stream Processing  →  Stage 3: Metrics API
        (Generator UI)             (Kinesis → Lambda)              (Lambda)
               ↓                          ↓                            ↓
          API Gateway              DynamoDB Tables               REST + WebSocket
          (REST POST)           (Metrics + Dimensions)           (API Gateway)
               ↓                          ↓                            ↓
       ProducerFunction             EventFunction               MetricsFunction
               ↓                          ↓                            ↓
          event-stream              S3 (Raw Backup)              Dashboard UI
           (Kinesis)                                            (CloudFront + S3)
```

### Components

- **Event Generator UI** — React frontend hosted on S3/CloudFront. Uses a Web Worker to continuously generate ad events (impressions, clicks, conversions) and sends them in batches of 100 via 10 parallel POST requests
- **Producer Lambda** — Validates and enriches events, then writes them to the Kinesis stream in batches of up to 500 records with automatic retry on partial failures
- **Event Lambda** — Consumes Kinesis records, aggregates metrics into DynamoDB, backs up raw events to S3, and pushes real-time updates to all connected WebSocket clients
- **Metrics Lambda** — Reads aggregated data from DynamoDB and serves it via GET `/metrics`
- **Event Dashboard UI** — React frontend hosted on S3/CloudFront. Connects via WebSocket and displays live impressions, clicks, and conversions
- **Cognito User Pool** — Manages dashboard authentication with admin-only user creation

## Prerequisites

- AWS Account with appropriate permissions
- Node.js 18.x — [nodejs.org](https://nodejs.org/)
- AWS SAM CLI — [aws.amazon.com/serverless/sam](https://aws.amazon.com/serverless/sam/)
- AWS CLI configured with credentials — [aws.amazon.com/cli](https://aws.amazon.com/cli/)
- Bash shell (Linux/macOS) or PowerShell (Windows)

## Project Structure

```
poc-adtech/
├── backend/
│   └── event-backend/
│       ├── template.yaml              # SAM CloudFormation template
│       └── src/
│           ├── producer.js            # Producer Lambda — validates + puts events to Kinesis
│           ├── app.js                 # Event Lambda — Kinesis consumer, DynamoDB + S3 + WebSocket
│           └── metrics.js             # Metrics Lambda — reads DynamoDB, serves REST API
├── event-generator/                   # React + Vite frontend — generates ad events
│   └── src/
│       ├── App.jsx                    # Start/Stop UI, live counters, batch sender
│       └── eventWorker.js             # Web Worker — generates events off the main thread
├── event-dashboard/                   # React + Vite frontend — displays live metrics
│   └── .env                           # VITE_METRICS_URL + VITE_WS_URL (auto-injected)
├── deploy.sh                          # End-to-end deploy script (Linux/macOS)
├── deploy.ps1                         # End-to-end deploy script (Windows)
├── payload.json                       # Sample test event payload
└── package.json
```

## Installation & Setup

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/vishnuganta8245/poc-adtech.git
cd poc-adtech

npm install
cd event-generator && npm install && cd ..
cd event-dashboard && npm install && cd ..
cd backend/event-backend && npm install && cd ../..
```

### 2. Configure AWS

```bash
aws configure
```

Enter your:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `us-east-1`
- Default output format: `json`

## Deployment

### First-time Deployment

The deploy script handles everything end-to-end:

1. Builds and deploys the SAM backend stack to AWS
2. Reads CloudFormation outputs — Events API, Metrics API, WebSocket URL, S3 bucket names, CloudFront URLs
3. Auto-injects those URLs into the frontend source files
4. Builds both React apps and uploads them to their S3 buckets

```bash
# Linux / macOS
chmod +x deploy.sh
./deploy.sh

# Windows
./deploy.ps1
```

After the script completes, your live URLs are printed:

```
Generator : https://<generator-cloudfront-id>.cloudfront.net
Dashboard : https://<dashboard-cloudfront-id>.cloudfront.net
```

### Redeploy Backend Only

```bash
cd backend/event-backend
sam build && sam deploy
cd ../..
```

### Redeploy Frontends Only

```bash
# Generator
cd event-generator && npm run build
aws s3 sync dist/ s3://<event-backend-event-generator-accountid> --delete && cd ..

# Dashboard
cd event-dashboard && npm run build
aws s3 sync dist/ s3://<event-backend-event-dashboard-accountid> --delete && cd ..
```

## Usage

### Starting Event Generation

1. Navigate to the Generator CloudFront URL
2. Click **Start** — a Web Worker begins generating impressions, clicks, and conversions continuously
3. Events are batched (100 per batch) and sent via 10 parallel POST requests to the REST API
4. Live counters on the generator UI update every second

### Stopping Event Generation

1. Click **Stop** on the generator UI
2. The Web Worker is terminated and any remaining buffered events are flushed

### Viewing Metrics

1. Navigate to the Dashboard CloudFront URL
2. Log in with your Cognito credentials
3. Metrics update in real-time via WebSocket — impressions, clicks, and conversions

## API Endpoints

### REST API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/events` | Submit a batch of ad events |
| GET | `/metrics` | Get current aggregated metrics snapshot |

### WebSocket API

**URL:** `wss://<api-id>.execute-api.us-east-1.amazonaws.com/Prod`

| Route | Description |
|---|---|
| `$connect` | Dashboard connects; connection ID stored in DynamoDB |
| `$disconnect` | Dashboard disconnects; connection removed from DynamoDB |
| Push | Event Lambda broadcasts updated metrics to all active connections |

### Event Payload Schema

Each event sent to `POST /events` requires at minimum:

| Field | Type | Description |
|---|---|---|
| `event_id` | string | Required. Unique event identifier. Used as Kinesis partition key |
| `event_type` | string | `impression`, `click`, or `conversion` |
| `campaign_id` | string | Ad campaign identifier (defaults to `"default-key"` if missing) |
| `event_timestamp` | string | ISO 8601 timestamp (auto-set by Producer if missing) |

Example:

```json
[
  {
    "event_id": "evt-001",
    "event_type": "impression",
    "campaign_id": "campaign-abc",
    "event_timestamp": "2026-05-18T10:00:00.000Z"
  }
]
```

## AWS Resources Created

The SAM stack (`event-backend`) provisions:

| Resource | Name / Details |
|---|---|
| Kinesis Stream | `event-stream` — on-demand mode |
| Lambda — ProducerFunction | `producer.handler` — 512 MB, 10s timeout |
| Lambda — EventFunction | `app.lambdaHandler` — 512 MB, 30s timeout |
| Lambda — MetricsFunction | `metrics.lambdaHandler` — 512 MB, 10s timeout |
| API Gateway (REST) | `POST /events` and `GET /metrics` |
| API Gateway (WebSocket) | `$connect` / `$disconnect`, stage: `Prod` |
| DynamoDB — MetricsTable | `event-metrics-table` — aggregated counts (pk + sk) |
| DynamoDB — DimensionsTable | `event-dimensions-table` — geo, user, device dimensions (pk + sk) |
| DynamoDB — ConnectionsTable | `event-backend-ws-connections` — active WebSocket connections (TTL enabled) |
| S3 Bucket | Raw event backup |
| S3 Bucket | Event Generator frontend assets |
| S3 Bucket | Event Dashboard frontend assets |
| CloudFront | Generator UI — OAC + SigV4, HTTPS redirect |
| CloudFront | Dashboard UI — OAC + SigV4, HTTPS redirect |
| Cognito User Pool | `EventLens` — admin-created users, email verified |
| Cognito App Client | `EventLens-App` — password + refresh token auth |

## Monitoring

CloudWatch Logs are automatically created for all Lambda functions:

- `/aws/lambda/event-backend-ProducerFunction`
- `/aws/lambda/event-backend-EventFunction`
- `/aws/lambda/event-backend-MetricsFunction`

Tail logs live:

```bash
sam logs -n ProducerFunction --stack-name event-backend --tail
sam logs -n EventFunction --stack-name event-backend --tail
sam logs -n MetricsFunction --stack-name event-backend --tail
```

## Configuration

Edit `backend/event-backend/template.yaml` to adjust:

| Parameter | Default | Description |
|---|---|---|
| `MemorySize` | `512` MB | Memory for all Lambda functions |
| `Timeout` — Producer | `10` s | Max execution time for Producer Lambda |
| `Timeout` — EventFunction | `30` s | Max execution time for Event Lambda |
| `Timeout` — MetricsFunction | `10` s | Max execution time for Metrics Lambda |
| `BatchSize` | `100` | Kinesis records per Lambda invocation |
| `StageName` | `Prod` | API Gateway and WebSocket stage name |

Edit `event-generator/src/App.jsx` to adjust:

| Constant | Default | Description |
|---|---|---|
| `BATCH_SIZE` | `100` | Events buffered before sending a batch |
| `MAX_PARALLEL_REQUESTS` | `10` | Concurrent POST requests to the API |

## Security

- S3 buckets have public access blocked
- CloudFront uses Origin Access Control (OAC) with SigV4 signing on both distributions
- Lambda functions have minimal, scoped IAM permissions per function
- DynamoDB uses on-demand billing — no exposed provisioned capacity
- WebSocket connections stored with TTL — stale connections auto-expire
- Cognito User Pool enforces password policy (min 8 chars, upper, lower, numbers)
- Admin-only user creation — no self-signup

## Cleanup

To delete all AWS resources and avoid ongoing charges:

```bash
# Empty S3 buckets first (required before stack deletion)
aws s3 rm s3://<event-backend-event-generator-accountid> --recursive
aws s3 rm s3://<event-backend-event-dashboard-accountid> --recursive
aws s3 rm s3://<raw-event-storage-bucket> --recursive

# Delete the stack
cd backend/event-backend
sam delete --stack-name event-backend
```

## Troubleshooting

### No Events Appearing on Dashboard

- Check CloudWatch logs for `EventFunction` — Kinesis may not be triggering
- Verify the `event-stream` Kinesis stream exists and is active in the AWS console
- Confirm `ProducerFunction` is successfully receiving requests (check `/events` logs)
- Make sure events include a valid `event_id` field — records without it are dropped

### CloudFront Shows Outdated Content

```bash
aws cloudfront create-invalidation \
  --distribution-id <id> \
  --paths "/*"
```

### WebSocket Not Connecting on Dashboard

- Confirm `event-dashboard/.env` has `VITE_WS_URL` populated after deploy
- Verify the WebSocket stage `Prod` is deployed in the API Gateway console
- Check `EventFunction` CloudWatch logs for `$connect` / `$disconnect` errors

### Stack in DELETE_FAILED State

```bash
# Find the blocking resource
aws cloudformation describe-stack-events \
  --stack-name event-backend \
  --region us-east-1 | grep DELETE_FAILED

# Empty all S3 buckets, then retry delete
aws cloudformation delete-stack \
  --stack-name event-backend \
  --region us-east-1
```

## License

MIT
