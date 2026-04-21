const AWS = require("aws-sdk");
const kinesis = new AWS.Kinesis();

const STREAM_NAME = process.env.STREAM_NAME;
const MAX_RECORDS_PER_BATCH = 500;

exports.handler = async (event) => {
  try {
    // 🔥 1. Handle CORS preflight
    if (
      event.httpMethod === "OPTIONS" ||
      event.requestContext?.http?.method === "OPTIONS"
    ) {
      return response(200, {});
    }

    console.log("🔥 Incoming request");

    // 🔥 2. Parse body safely
    let body;
    try {
      body =
        typeof event.body === "string"
          ? JSON.parse(event.body)
          : event.body;
    } catch (err) {
      console.error("❌ JSON parse error:", err);
      return response(400, { message: "Invalid JSON format" });
    }

    // 🔥 3. Normalize to array
    const events = Array.isArray(body) ? body : [body];

    console.log(`📦 Received events: ${events.length}`);

    if (!events.length) {
      return response(400, { message: "No events provided" });
    }

    // 🔥 4. Validate + enrich
    const validEvents = [];
    for (const e of events) {
      if (!e || !e.event_id) continue;

      validEvents.push({
        ...e,
        event_timestamp:
          e.event_timestamp || new Date().toISOString(),
      });
    }

    console.log(`✅ Valid events: ${validEvents.length}`);

    if (!validEvents.length) {
      return response(400, {
        message: "No valid events (missing event_id)",
      });
    }

    // 🔥 5. Chunk for Kinesis
    const chunks = chunkArray(validEvents, MAX_RECORDS_PER_BATCH);

    let totalFailed = 0;
    let totalSent = 0;

    // 🚀 6. Send to Kinesis
    for (const chunk of chunks) {
      let records = chunk.map((e) => ({
        Data: JSON.stringify(e),

        // ✅ FIXED: Avoid hot shards
        PartitionKey:
          e.event_id ||
          `${Date.now()}_${Math.random()}`,
      }));

      let attempt = 0;

      while (records.length > 0 && attempt < 2) {
        console.log(
          `🚀 Sending batch of ${records.length} records (attempt ${
            attempt + 1
          })`
        );

        const res = await kinesis
          .putRecords({
            StreamName: STREAM_NAME,
            Records: records,
          })
          .promise();

        // ✅ SUCCESS
        if (res.FailedRecordCount === 0) {
          console.log("✅ Batch success");

          totalSent += records.length;

          // clear records → exit retry loop
          records = [];
          break;
        }

        // ⚠️ PARTIAL FAILURE
        console.warn(
          `⚠️ Failed records: ${res.FailedRecordCount}`
        );

        // count successful ones
        totalSent += records.length - res.FailedRecordCount;

        // retry only failed records
        records = res.Records
          .map((r, i) => (r.ErrorCode ? records[i] : null))
          .filter(Boolean);

        attempt++;
      }

      // ❌ FINAL FAILURE
      if (records.length > 0) {
        totalFailed += records.length;
        console.error(
          `❌ Permanent failures after retry: ${records.length}`
        );
      }
    }

    console.log(
      `🎯 Final Summary → Sent: ${totalSent}, Failed: ${totalFailed}`
    );

    return response(200, {
      message: "Events ingested successfully",
      totalEvents: validEvents.length,
      sent: totalSent,
      failed: totalFailed,
    });

  } catch (err) {
    console.error("🔥 Lambda crash:", err);

    return response(500, {
      message: "Internal Server Error",
      error: err.message,
    });
  }
};


// ── Helpers ─────────────────────────────────────────────

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}