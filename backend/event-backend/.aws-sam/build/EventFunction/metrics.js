const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME;
const DIM_TABLE = process.env.DIM_TABLE;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function scanAll(table) {
  let items = [];
  let lastKey;
  do {
    const params = { TableName: table };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await dynamodb.scan(params).promise();
    items = items.concat(res.Items || []);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

exports.lambdaHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const metricsData = await scanAll(TABLE_NAME);
    const dimData = await scanAll(DIM_TABLE);

    // ── Get all unique campaign IDs from metrics table ──
    const campaignIds = [...new Set(metricsData.map((i) => i.pk).filter(Boolean))];

    // ── Per-campaign metrics aggregation ──
    const perCampaign = {};

    for (const campId of campaignIds) {
      perCampaign[campId] = {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        timeSeries: {},
      };
    }

    // Overall totals
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    const overallTimeSeries = {};

    for (const item of metricsData) {
      const campId = item.pk;

      totalImpressions += item.impressions || 0;
      totalClicks += item.clicks || 0;
      totalConversions += item.conversions || 0;
      totalRevenue += item.revenue || 0;

      if (item.sk) {
        overallTimeSeries[item.sk] =
          (overallTimeSeries[item.sk] || 0) +
          (item.impressions || 0) + (item.clicks || 0) + (item.conversions || 0);
      }

      if (campId && perCampaign[campId]) {
        perCampaign[campId].impressions += item.impressions || 0;
        perCampaign[campId].clicks += item.clicks || 0;
        perCampaign[campId].conversions += item.conversions || 0;
        perCampaign[campId].revenue += item.revenue || 0;

        if (item.sk) {
          perCampaign[campId].timeSeries[item.sk] =
            (perCampaign[campId].timeSeries[item.sk] || 0) +
            (item.impressions || 0) + (item.clicks || 0) + (item.conversions || 0);
        }
      }
    }

    // ── Per-campaign dimension aggregation ──
    // dim pk format: CAMPAIGN_ID#type#value
    const perCampaignDims = {};
    for (const campId of campaignIds) {
      perCampaignDims[campId] = {
        geo: {}, device: {}, channel: {}, gender: {}, age: {}, segment: {},
      };
    }

    // Overall dims
    const overallDims = {
      geo: {}, device: {}, channel: {}, gender: {}, age: {}, segment: {},
    };

    for (const item of dimData) {
      const parts = item.pk.split("#");
      if (parts.length < 3) continue;

      const campId = parts[0];
      const type = parts[1];
      const value = parts[2];
      const count = item.count || 0;

      // Add to overall
      if (overallDims[type]) {
        overallDims[type][value] = (overallDims[type][value] || 0) + count;
      }

      // Add to per-campaign
      if (perCampaignDims[campId] && perCampaignDims[campId][type]) {
        perCampaignDims[campId][type][value] =
          (perCampaignDims[campId][type][value] || 0) + count;
      }
    }

    // ── Build per-campaign summary array (for campaign tab charts) ──
    const campaignSummaries = campaignIds.map((campId) => {
      const c = perCampaign[campId];
      const totalEvents = c.impressions + c.clicks + c.conversions;
      const ctr = c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0";
      const convRate = c.clicks ? ((c.conversions / c.clicks) * 100).toFixed(2) : "0";

      return {
        id: campId,
        name: campId,
        totalEvents,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
        revenue: c.revenue,
        ctr: parseFloat(ctr),
        conversionRate: parseFloat(convRate),
        timeSeriesEvents: formatTimeSeries(c.timeSeries),
        dims: {
          byGender: toChartData(perCampaignDims[campId]?.gender || {}),
          byAge: toChartData(perCampaignDims[campId]?.age || {}),
          bySegment: toChartData(perCampaignDims[campId]?.segment || {}),
          byCity: toChartData(perCampaignDims[campId]?.geo || {}),
          byDevice: toChartData(perCampaignDims[campId]?.device || {}),
          byChannel: toChartData(perCampaignDims[campId]?.channel || {}),
        },
      };
    });

    // ── Overall totals ──
    const totalEvents = totalImpressions + totalClicks + totalConversions;
    const ctr = totalImpressions ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0";
    const conversionRate = totalClicks ? ((totalConversions / totalClicks) * 100).toFixed(2) : "0";

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        // Overview KPIs
        totalEvents,
        totalImpressions,
        totalClicks,
        totalConversions,
        totalRevenue,
        ctr,
        conversionRate,
        timeSeriesEvents: formatTimeSeries(overallTimeSeries),

        // Overall dims (for audience/geography "all campaigns" view)
        byGender: toChartData(overallDims.gender),
        byAge: toChartData(overallDims.age),
        bySegment: toChartData(overallDims.segment),
        byCity: toChartData(overallDims.geo),
        byDevice: toChartData(overallDims.device),
        byChannel: toChartData(overallDims.channel),

        // Per-campaign (campaigns tab + filtered audience/geo)
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

function toChartData(obj = {}) {
  return Object.entries(obj).map(([name, value]) => ({ name, value }));
}

function formatTimeSeries(map) {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-20)
    .map(([t, count]) => ({ t: t.slice(11), count }));
}
