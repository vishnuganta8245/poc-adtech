const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const METRICS_TABLE = process.env.TABLE_NAME;
const DIM_TABLE = process.env.DIM_TABLE;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Get all campaign IDs (safe scan)
async function getCampaignIds() {
  let items = [];
  let lastKey;

  do {
    const res = await dynamodb.scan({
      TableName: METRICS_TABLE,
      FilterExpression: "sk = :t",
      ExpressionAttributeValues: { ":t": "TOTAL" },
      ProjectionExpression: "pk",
      ExclusiveStartKey: lastKey,
    }).promise();

    items = items.concat(res.Items || []);
    lastKey = res.LastEvaluatedKey;

  } while (lastKey);

  return [...new Set(items.map(i => i.pk))];
}

// Get TOTAL row
async function getTotalRow(campaignId) {
  const res = await dynamodb.query({
    TableName: METRICS_TABLE,
    KeyConditionExpression: "pk = :pk AND sk = :sk",
    ExpressionAttributeValues: {
      ":pk": campaignId,
      ":sk": "TOTAL",
    },
  }).promise();

  return res.Items?.[0];
}

// Get last 20 time buckets
async function getTimeSeries(campaignId, limit = 20) {
  const res = await dynamodb.query({
    TableName: METRICS_TABLE,
    KeyConditionExpression: "pk = :pk AND sk < :total",
    ExpressionAttributeValues: {
      ":pk": campaignId,
      ":total": "TOTAL",
    },
    ScanIndexForward: false,
    Limit: limit,
  }).promise();

  return res.Items || [];
}

// Get dimensions for campaign
async function getDims(campaignId) {
  const res = await dynamodb.query({
    TableName: DIM_TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": campaignId,
    },
  }).promise();

  return res.Items || [];
}

exports.lambdaHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const campaignIds = await getCampaignIds();

    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    const overallTimeSeries = {};
    const overallDims = {
      geo: {}, device: {}, channel: {}, gender: {}, age: {}, segment: {},
    };

    const campaignSummaries = [];

    const campResults = await Promise.all(
      campaignIds.map((campId) =>
        Promise.all([
          getTotalRow(campId),
          getTimeSeries(campId),
          getDims(campId),
        ]).then(([totalRow, timeRows, dimRows]) => ({ campId, totalRow, timeRows, dimRows }))
      )
    );

    for (const { campId, totalRow, timeRows, dimRows } of campResults) {

      const impressions = totalRow?.impressions || 0;
      const clicks = totalRow?.clicks || 0;
      const conversions = totalRow?.conversions || 0;
      const revenue = totalRow?.revenue || 0;

      totalImpressions += impressions;
      totalClicks += clicks;
      totalConversions += conversions;
      totalRevenue += revenue;

      // Time series
      const tsMap = {};
      for (const item of timeRows) {
        const t = item.sk;
        const val =
          (item.impressions || 0) +
          (item.clicks || 0) +
          (item.conversions || 0);

        tsMap[t] = (tsMap[t] || 0) + val;
        overallTimeSeries[t] = (overallTimeSeries[t] || 0) + val;
      }

      // Dimensions
      const dims = {
        geo: {}, device: {}, channel: {}, gender: {}, age: {}, segment: {},
      };

      for (const item of dimRows) {
        const [type, value] = item.sk.split("#");
        const count = item.count || 0;

        if (dims[type]) {
          dims[type][value] = (dims[type][value] || 0) + count;
        }

        if (overallDims[type]) {
          overallDims[type][value] = (overallDims[type][value] || 0) + count;
        }
      }

      // Build campaign summary
      const totalEvents = impressions + clicks + conversions;
      const ctr = impressions ? (clicks / impressions) * 100 : 0;
      const conversionRate = clicks ? (conversions / clicks) * 100 : 0;

      campaignSummaries.push({
        id: campId,
        name: campId,
        totalEvents,
        impressions,
        clicks,
        conversions,
        revenue,
        ctr: parseFloat(ctr.toFixed(2)),
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        timeSeriesEvents: formatTimeSeries(tsMap),
        dims: {
          byGender: toChartData(dims.gender),
          byAge: toChartData(dims.age),
          bySegment: toChartData(dims.segment),
          byCity: toChartData(dims.geo),
          byDevice: toChartData(dims.device),
          byChannel: toChartData(dims.channel),
        },
      });
    }

    const totalEvents = totalImpressions + totalClicks + totalConversions;
    const ctr = totalImpressions ? (totalClicks / totalImpressions) * 100 : 0;
    const conversionRate = totalClicks ? (totalConversions / totalClicks) * 100 : 0;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        totalEvents,
        totalImpressions,
        totalClicks,
        totalConversions,
        totalRevenue,
        ctr: ctr.toFixed(2),
        conversionRate: conversionRate.toFixed(2),
        timeSeriesEvents: formatTimeSeries(overallTimeSeries),

        byGender: toChartData(overallDims.gender),
        byAge: toChartData(overallDims.age),
        bySegment: toChartData(overallDims.segment),
        byCity: toChartData(overallDims.geo),
        byDevice: toChartData(overallDims.device),
        byChannel: toChartData(overallDims.channel),

        campaigns: campaignSummaries,
        campaignIds,
      }),
    };

  } catch (err) {
    console.error("ERROR:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Internal Server Error", error: err.message }),
    };
  }
};

// Helpers
function toChartData(obj = {}) {
  return Object.entries(obj).map(([name, value]) => ({ name, value }));
}

function formatTimeSeries(map) {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-20)
    .map(([t, count]) => ({
      t: t.slice(11),
      count
    }));
}