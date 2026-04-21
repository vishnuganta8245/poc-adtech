const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const METRICS_TABLE = process.env.TABLE_NAME;
const DIM_TABLE = process.env.DIM_TABLE;
const BUCKET_NAME = process.env.BUCKET_NAME;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

exports.lambdaHandler = async (event) => {
  try {
    console.log("📦 Batch size:", event.Records.length);

    const metricsAgg = {};
    const dimensionAgg = {};
    const rawEvents = [];

    for (const record of event.Records) {
      try {
        const decoded = Buffer.from(record.kinesis.data, "base64").toString("utf-8");
        const evt = JSON.parse(decoded);

        if (!evt.event_id) continue;

        rawEvents.push(evt);

        const geo = pick(["Bangalore","Chennai","Hyderabad","Mumbai","Delhi"]);
        const gender = pick(["male","female"]);
        const age = pick(["18-25","25-40","40+"]);
        const segment = pick(["traveller","gamer","professional","shopper"]);
        const device = evt.device?.device_type || "unknown";
        const channel = evt.channel || "unknown";

        const minute = evt.event_timestamp.slice(0, 16);
        const campaign = evt.campaign_id;

        // ───────────── METRICS ─────────────
        const mKey = `${campaign}_${minute}`;

        if (!metricsAgg[mKey]) {
          metricsAgg[mKey] = {
            pk: campaign,
            sk: minute,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            revenue: 0
          };
        }

        const m = metricsAgg[mKey];

        if (evt.event_type === "impression") m.impressions++;
        if (evt.event_type === "click") m.clicks++;
        if (evt.event_type === "conversion") {
          m.conversions++;
          m.revenue += evt.conversion_value || 0;
        }

        // ───────────── DIMENSIONS ─────────────
        addDim(dimensionAgg, campaign, minute, "geo", geo);
        addDim(dimensionAgg, campaign, minute, "gender", gender);
        addDim(dimensionAgg, campaign, minute, "age", age);
        addDim(dimensionAgg, campaign, minute, "segment", segment);
        addDim(dimensionAgg, campaign, minute, "device", device);
        addDim(dimensionAgg, campaign, minute, "channel", channel);

      } catch (err) {
        console.error("❌ Record error:", err);
      }
    }

    // ───────────── WRITE METRICS (SAFE) ─────────────
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

    // ───────────── WRITE DIMENSIONS (SAFE) ─────────────
    const dimWrites = Object.values(dimensionAgg).map((item) =>
      dynamodb.update({
        TableName: DIM_TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: `ADD #cnt :val`,
        ExpressionAttributeNames: {
          "#cnt": "count"
        },
        ExpressionAttributeValues: {
          ":val": item.count
        }
      }).promise()
    );

    await Promise.all([...metricWrites, ...dimWrites]);

    console.log("✅ Metrics:", metricWrites.length);
    console.log("✅ Dimensions:", dimWrites.length);

    // ───────────── S3 BACKUP ─────────────
    if (rawEvents.length > 0) {
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: `raw/${Date.now()}.json`,
        Body: JSON.stringify(rawEvents)
      }).promise();
    }

    return { statusCode: 200 };

  } catch (err) {
    console.error("🔥 Crash:", err);
    throw err;
  }
};

// ───────────── HELPER ─────────────

function addDim(map, campaign, minute, type, value) {
  const key = `${campaign}#${type}#${value}_${minute}`;

  if (!map[key]) {
    map[key] = {
      pk: `${campaign}#${type}#${value}`,
      sk: minute,
      count: 0
    };
  }

  map[key].count++;
}