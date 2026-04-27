const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const METRICS_TABLE = process.env.TABLE_NAME;
const DIM_TABLE = process.env.DIM_TABLE;
const BUCKET_NAME = process.env.BUCKET_NAME;
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const WS_ENDPOINT = process.env.WS_ENDPOINT;

//  Helper → 5-min bucket
function get5MinBucket(ts) {
  const d = new Date(ts);
  d.setSeconds(0, 0);

  const minutes = d.getMinutes();
  d.setMinutes(minutes - (minutes % 5));

  return d.toISOString().slice(0, 16);
}

//  Weighted random
function weightedPick(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const r = Math.random() * total;

  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    sum += weights[i];
    if (r < sum) return items[i];
  }
}

const genderWeights = [0.65, 0.35];
const ageWeights = [0.4, 0.45, 0.15];

exports.lambdaHandler = async (event) => {
  if (event.requestContext?.routeKey === "$connect") {
    await dynamodb.put({
      TableName: CONNECTIONS_TABLE,
      Item: { connectionId: event.requestContext.connectionId, ttl: Math.floor(Date.now() / 1000) + 7200 },
    }).promise();
    return { statusCode: 200 };
  }

  if (event.requestContext?.routeKey === "$disconnect") {
    await dynamodb.delete({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId: event.requestContext.connectionId },
    }).promise();
    return { statusCode: 200 };
  }

  try {
    const metricsAgg = {};
    const dimensionAgg = {};
    const rawEvents = [];

    for (const record of event.Records) {
      try {
        const decoded = Buffer.from(record.kinesis.data, "base64").toString("utf-8");
        const evt = JSON.parse(decoded);

        if (!evt.event_id) continue;

        rawEvents.push(evt);

        const geo = evt.geo?.city || "unknown";
        const device = evt.device?.device_type || "unknown";
        const channel = evt.channel || "unknown";

        const gender = weightedPick(["male","female"], genderWeights);
        const age = weightedPick(["18-25","25-40","40+"], ageWeights);

        let segment = "regular";
        if (channel === "instagram") segment = "traveller";
        if (channel === "youtube") segment = "gamer";
        if (device === "desktop") segment = "professional";
        if (channel === "facebook") segment = "shopper";

        const campaign = evt.campaign_id;

        // ───────── METRICS (BUCKET) ─────────
        const bucket = get5MinBucket(evt.event_timestamp);
        const mKey = `${campaign}_${bucket}`;

        if (!metricsAgg[mKey]) {
          metricsAgg[mKey] = {
            pk: campaign,
            sk: bucket,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            revenue: 0
          };
        }

        // ───────── METRICS (TOTAL) ─────────
        const totalKey = `${campaign}_TOTAL`;

        if (!metricsAgg[totalKey]) {
          metricsAgg[totalKey] = {
            pk: campaign,
            sk: "TOTAL",
            impressions: 0,
            clicks: 0,
            conversions: 0,
            revenue: 0
          };
        }

        const m = metricsAgg[mKey];
        const t = metricsAgg[totalKey];

        if (evt.event_type === "impression") {
          m.impressions++; t.impressions++;
        }
        if (evt.event_type === "click") {
          m.clicks++; t.clicks++;
        }
        if (evt.event_type === "conversion") {
          m.conversions++; t.conversions++;
          m.revenue += evt.conversion_value || 0;
          t.revenue += evt.conversion_value || 0;
        }

        // ───────── DIMENSIONS (NEW DESIGN) ─────────
        addDim(dimensionAgg, campaign, "geo", geo);
        addDim(dimensionAgg, campaign, "gender", gender);
        addDim(dimensionAgg, campaign, "age", age);
        addDim(dimensionAgg, campaign, "segment", segment);
        addDim(dimensionAgg, campaign, "device", device);
        addDim(dimensionAgg, campaign, "channel", channel);

      } catch (err) {
        console.error("Record error:", err);
      }
    }

    // ───────── WRITE METRICS ─────────
    const metricWrites = Object.values(metricsAgg).map((item) =>
      dynamodb.update({
        TableName: METRICS_TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: `
          ADD impressions :i,
              clicks :c,
              conversions :cv,
              revenue :r
        `,
        ExpressionAttributeValues: {
          ":i": item.impressions,
          ":c": item.clicks,
          ":cv": item.conversions,
          ":r": item.revenue
        }
      }).promise()
    );

    // ───────── WRITE DIMENSIONS (NEW) ─────────
    const dimWrites = Object.values(dimensionAgg).map((item) =>
      dynamodb.update({
        TableName: DIM_TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: "ADD #cnt :val",
        ExpressionAttributeNames: {
          "#cnt": "count"
        },
        ExpressionAttributeValues: {
          ":val": item.count
        }
      }).promise()
    );

    await Promise.all([...metricWrites, ...dimWrites]);

    // ───────── STORE RAW EVENTS ─────────
    if (rawEvents.length > 0) {
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: `raw/${Date.now()}.json`,
        Body: JSON.stringify(rawEvents)
      }).promise();
    }

    // ───────── PUSH TO WEBSOCKET CLIENTS ─────────
    await pushToClients();

    return { statusCode: 200 };

  } catch (err) {
    console.error("Crash:", err);
    throw err;
  }
};

let lastPushTime = 0;

async function pushToClients() {
  if (!CONNECTIONS_TABLE || !WS_ENDPOINT) return;
  const now = Date.now();
  if (now - lastPushTime < 500) return;
  lastPushTime = now;
  try {
    const conns = await dynamodb.scan({
      TableName: CONNECTIONS_TABLE,
      ProjectionExpression: "connectionId",
    }).promise();

    if (!conns.Items?.length) return;

    const ws = new AWS.ApiGatewayManagementApi({ endpoint: WS_ENDPOINT });

    await Promise.all(
      conns.Items.map(({ connectionId }) =>
        ws.postToConnection({
          ConnectionId: connectionId,
          Data: JSON.stringify({ type: "refresh" }),
        }).promise().catch(() =>
          dynamodb.delete({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }).promise()
        )
      )
    );
  } catch (e) {
    console.error("WS push error:", e);
  }
}

//  NEW DIM HELPER
function addDim(map, campaign, type, value) {
  const key = `${campaign}_${type}_${value}`;

  if (!map[key]) {
    map[key] = {
      pk: campaign,
      sk: `${type}#${value}`,
      count: 0
    };
  }

  map[key].count++;
}