//  Worker Thread (runs in parallel)

let interval;
let eventId = Date.now();

const TARGET_EVENTS_PER_SEC = 850;
const INTERVAL_MS = 100;
const VARIANCE = 0.3;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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

//  DATA
const campaignIds = ["cmp_1", "cmp_2", "cmp_3"];
const adIds = ["ad_1", "ad_2", "ad_3"];
const cities = ["Mumbai", "Delhi", "Bangalore"];

//  WEIGHTS
const campaignWeights = [0.5, 0.3, 0.2];
const cityWeights = [0.5, 0.3, 0.2]; // Mumbai dominant
const channelWeights = [0.5, 0.3, 0.2];
const deviceWeights = [0.8, 0.2];

//  Profiles
const preGeneratedProfiles = Array.from({ length: 1000 }).map(() => ({
  channel: weightedPick(["instagram", "youtube", "facebook"], channelWeights),
  geo: {
    country: "India",
    city: weightedPick(cities, cityWeights),
  },
  device: {
    device_type: weightedPick(["mobile", "desktop"], deviceWeights),
  },
}));

self.onmessage = (e) => {
  if (e.data === "start") {
    interval = setInterval(() => {
      const varianceFactor =
        1 + (Math.random() * 2 - 1) * VARIANCE;

      const eventsThisSecond =
        TARGET_EVENTS_PER_SEC * varianceFactor;

      const eventsPerTick =
        (eventsThisSecond * INTERVAL_MS) / 1000;

      const count = Math.floor(eventsPerTick);

      const batch = [];

      for (let i = 0; i < count; i++) {
        const profile = pick(preGeneratedProfiles);

        const campaign = weightedPick(campaignIds, campaignWeights);

        let type = "impression";

        let clickProb = 0.25;
        let conversionProb = 0.08;

        if (campaign === "cmp_1") {
          clickProb = 0.35;
          conversionProb = 0.12;
        }
        if (campaign === "cmp_2") {
          clickProb = 0.25;
          conversionProb = 0.08;
        }
        if (campaign === "cmp_3") {
          clickProb = 0.18;
          conversionProb = 0.05;
        }

        if (Math.random() < clickProb) type = "click";
        if (type === "click" && Math.random() < conversionProb) {
          type = "conversion";
        }

        batch.push({
          event_id: `evt_${eventId++}`,
          event_type: type,
          event_timestamp: new Date().toISOString(),
          campaign_id: campaign,
          ad_id: pick(adIds),
          conversion_value: type === "conversion" ? 50 : 0,
          ...profile,
        });
      }

      self.postMessage(batch);
    }, INTERVAL_MS);
  }

  if (e.data === "stop") {
    clearInterval(interval);
  }
};