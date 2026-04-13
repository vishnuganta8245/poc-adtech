const AWS = require("aws-sdk");
const { randomUUID } = require("crypto");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const sns = new AWS.SNS();

const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;
const TOPIC_ARN = process.env.TOPIC_ARN;
const MAX_BATCH_SIZE = 100;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

exports.lambdaHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    if (!Array.isArray(body) || body.length === 0) {
      return respond(400, { message: "Expected a non-empty array of events" });
    }

    if (body.length > MAX_BATCH_SIZE) {
      return respond(400, {
        message: `Batch size ${body.length} exceeds max allowed (${MAX_BATCH_SIZE})`,
      });
    }

    console.log("Received batch size:", body.length);

    const results = await Promise.allSettled(
      body.map((evt) => processEvent(evt))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results
      .map((r, i) =>
        r.status === "rejected"
          ? { index: i, reason: r.reason?.message }
          : null
      )
      .filter(Boolean);

    console.log(`Processed: ${succeeded} succeeded, ${failed.length} failed`);
    if (failed.length > 0) console.error("Failed events:", JSON.stringify(failed));

    return respond(207, {
      message: "Batch processed",
      succeeded,
      failed_count: failed.length,
      failures: failed,
    });

  } catch (error) {
    console.error("Lambda error:", error);
    return respond(500, { message: "Error processing batch", error: error.message });
  }
};

async function processEvent(evt) {
  if (!evt.event_id) {
    throw new Error("Missing event_id");
  }

  const timestamp = new Date().toISOString();

  const item = {
    event_id:         evt.event_id,
    event_type:       evt.event_type       ?? null,
    campaign_id:      evt.campaign_id      ?? null,
    ad_id:            evt.ad_id            ?? null,
    channel:          evt.channel          ?? null,
    partner_id:       evt.partner_id       ?? null,
    user:             evt.user             ?? null,
    device:           evt.device           ?? null,
    geo:              evt.geo              ?? null,
    conversion_value: evt.conversion_value ?? null,
    fraud_type:       evt.fraud_type       ?? null,
    timestamp,
  };

  // Fix 1: ConditionExpression prevents overwriting existing DynamoDB records
  await dynamodb.put({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: "attribute_not_exists(event_id)",
  }).promise();

  // Fix 2: UUID suffix prevents S3 key collisions
  const date = new Date().toISOString().slice(0, 10);
  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: `events/${date}/${evt.event_id}_${randomUUID()}.json`,
    Body: JSON.stringify({ ...evt, timestamp }),
    ContentType: "application/json",
  }).promise();

  if (evt.fraud_type) {
    await sns.publish({
      TopicArn: TOPIC_ARN,
      Message: JSON.stringify({ ...evt, timestamp }),
      Subject: "Fraud Event Detected",
    }).promise();
  }
}
