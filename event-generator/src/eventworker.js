// 🔥 Worker Thread (runs in parallel)

let interval;
let eventId = Date.now();

const TARGET_EVENTS_PER_SEC = 850;
const INTERVAL_MS = 100;
const VARIANCE = 0.3;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const campaignIds = ["cmp_1", "cmp_2", "cmp_3"];
const adIds = ["ad_1", "ad_2", "ad_3"];
const cities = ["Mumbai", "Delhi", "Bangalore"];

// 🔥 Pre-generated profiles (performance optimization)
const preGeneratedProfiles = Array.from({ length: 1000 }).map(() => ({
  channel: pick(["instagram", "youtube", "facebook"]),
  geo: { country: "India", city: pick(cities) },
  device: { device_type: pick(["mobile", "desktop"]) },
}));

self.onmessage = (e) => {
  if (e.data === "start") {
    interval = setInterval(() => {
      // 🔥 Temporal variance
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

        // 🔥 Correct funnel logic
        let type = "impression";

        if (Math.random() < 0.3) type = "click";
        if (type === "click" && Math.random() < 0.1) {
          type = "conversion";
        }

        batch.push({
          event_id: `evt_${eventId++}`,
          event_type: type,
          event_timestamp: new Date().toISOString(),
         campaign_id: pick(campaignIds) || "default-key",
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