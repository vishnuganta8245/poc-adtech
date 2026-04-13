import { useState, useRef } from "react";
import "./App.css";

const API_URL = "https://t5cq3pyrug.execute-api.us-east-1.amazonaws.com/Prod/events";
const BATCH_SIZE = 50;

function App() {
  const [eventCount, setEventCount] = useState(0);
  const [impressionCount, setImpressionCount] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [conversionCount, setConversionCount] = useState(0);
  const [fraudCount, setFraudCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const intervalRef = useRef(null);
  // Fix 3: Use Date.now() as base so event_ids are unique across resets
  const nextEventId = useRef(Date.now());

  const eventBufferRef = useRef([]);
  // Fix 1: Replace lock with a queue so batches are never dropped
  const sendQueue = useRef([]);
  const isSendingRef = useRef(false);

  const campaignIds = ["cmp_1001", "cmp_1002", "cmp_1003", "cmp_1004", "cmp_1005"];
  const adIds = ["ad_101", "ad_102", "ad_103", "ad_104", "ad_105", "ad_106"];
  const placements = ["top_banner", "sidebar", "in_feed", "footer_banner", "video_pre_roll"];
  const countries = ["India"];
  const cities = ["Bangalore", "Mumbai", "Hyderabad", "Chennai", "Delhi", "Pune"];
  const genders = ["male", "female"];
  const isps = ["Jio", "Airtel", "Vodafone", "BSNL", "ACT"];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randomRange = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const activeSessionsRef = useRef(new Map());
  const sessionProfileRef = useRef(new Map());
  const nextSessionId = useRef(1000);

  const fraudIpPoolRef = useRef(["192.168.50.1", "192.168.50.2", "192.168.50.3"]);
  const fraudDevicePoolRef = useRef(["dev_950", "dev_951", "dev_952"]);

  // Fix 1: Queue-based sender — processes one batch at a time, never drops
  const flushQueue = async () => {
    if (isSendingRef.current || sendQueue.current.length === 0) return;
    isSendingRef.current = true;

    while (sendQueue.current.length > 0) {
      const batch = sendQueue.current.shift();
      console.log("Sending batch to backend:", batch.length);
      try {
        await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
      } catch (e) {
        console.error("API Error:", e);
      }
    }

    isSendingRef.current = false;
  };

  const bufferEvent = (event) => {
    eventBufferRef.current.push(event);

    if (eventBufferRef.current.length >= BATCH_SIZE) {
      const batch = [...eventBufferRef.current];
      eventBufferRef.current = [];
      // Fix 1: Push to queue instead of dropping if already sending
      sendQueue.current.push(batch);
      flushQueue();
    }
  };

  const getSegmentByAge = (age) => {
    const mapping = {
      "18-24": ["student", "gamer"],
      "25-34": ["professional", "gamer", "shopper"],
      "35-44": ["professional", "shopper"],
      "45-54": ["shopper", "traveler"],
    };
    return pick(mapping[age]);
  };

  const getChannelBySegment = (segment) => {
    const mapping = {
      student: ["instagram", "youtube"],
      gamer: ["youtube", "twitter"],
      professional: ["linkedin", "twitter"],
      shopper: ["facebook", "instagram"],
      traveler: ["instagram", "youtube"],
    };
    return pick(mapping[segment]);
  };

  const getPartnerByGenderSegment = (gender, segment) => {
    const mapping = {
      male: {
        student: ["sports_site", "gaming_app"],
        gamer: ["gaming_app"],
        professional: ["finance_blog", "news_app"],
        shopper: ["shopping_app"],
        traveler: ["travel_blog"],
      },
      female: {
        student: ["shopping_app", "news_app"],
        gamer: ["gaming_app"],
        professional: ["news_app", "finance_blog"],
        shopper: ["shopping_app"],
        traveler: ["travel_blog"],
      },
    };
    return pick(mapping[gender][segment]);
  };

  const getDevice = (gender) => {
    let deviceType;
    if (gender === "female") {
      deviceType = pick(["mobile", "mobile", "tablet"]);
    } else {
      deviceType = pick(["mobile", "desktop", "desktop"]);
    }

    const osMap = {
      mobile: ["android", "ios"],
      desktop: ["windows", "macos"],
      tablet: ["android", "ios"],
    };

    return {
      device_id: `dev_${randomRange(100, 999)}`,
      device_type: deviceType,
      os: pick(osMap[deviceType]),
    };
  };

  const getSessionId = () => {
    const id = nextSessionId.current;
    if (id >= 9999) nextSessionId.current = 1000;
    else nextSessionId.current += 1;
    return `sess_${String(id).padStart(4, "0")}`;
  };

  const chooseSession = () => {
    const activeSessions = activeSessionsRef.current;

    if (activeSessions.size === 0 || Math.random() > 0.85) {
      const sessionId = getSessionId();
      activeSessions.set(sessionId, "impression");

      const age = pick(["18-24", "25-34", "35-44", "45-54"]);
      const gender = pick(genders);
      const segment = getSegmentByAge(age);

      sessionProfileRef.current.set(sessionId, {
        age_group: age,
        gender: gender,
        segment: segment,
      });

      return sessionId;
    }

    const keys = Array.from(activeSessions.keys());
    return pick(keys);
  };

  const buildEvent = (
    id,
    eventType,
    sessionId,
    fraudType = null,
    fraudIp = null,
    fraudDevice = null
  ) => {
    const profile = sessionProfileRef.current.get(sessionId);

    const event = {
      event_id: `evt_${id}`,
      event_type: eventType,
      event_timestamp: new Date().toISOString(),
      session_id: sessionId,
      campaign_id: pick(campaignIds),
      ad_id: pick(adIds),
      channel: getChannelBySegment(profile.segment),
      partner_id: getPartnerByGenderSegment(profile.gender, profile.segment),
      placement: pick(placements),
      geo: { country: pick(countries), city: pick(cities) },
      user: {
        age_group: profile.age_group,
        gender: profile.gender,
        segment: profile.segment,
      },
      device: getDevice(profile.gender),
      network: {
        ip_address: `192.168.${randomRange(0, 255)}.${randomRange(0, 255)}`,
        isp: pick(isps),
      },
      conversion_value:
        eventType === "conversion" ? pick([10, 20, 30, 50, 100]) : 0,
    };

    if (fraudType) {
      event.fraud_type = fraudType;
      event.conversion_value = 0;
    }

    return event;
  };

  const generateFraudEvent = () => {
    const fraudTypes = [
      "excessive_clicks_from_same_ip",
      "too_many_clicks_from_same_device",
      "unusual_geo_ip_patterns",
      "invalid_device_combo",
    ];

    const fraudType = pick(fraudTypes);
    const id = nextEventId.current++;
    const sessionId = chooseSession();

    return buildEvent(id, "click", sessionId, fraudType);
  };

  const handleStart = () => {
    if (!isRunning) {
      setIsRunning(true);

      intervalRef.current = setInterval(() => {
        let newImpressions = 0;
        let newClicks = 0;
        let newConversions = 0;
        let newFraud = 0;

        const baseEvents = 24;

        for (let i = 0; i < baseEvents; i++) {
          const id = nextEventId.current++;
          const sessionId = chooseSession();

          let type = "impression";
          if (Math.random() < 0.3) type = "click";
          if (type === "click" && Math.random() < 0.1) type = "conversion";

          const event = buildEvent(id, type, sessionId);

          bufferEvent(event);

          if (type === "impression") newImpressions++;
          if (type === "click") newClicks++;
          if (type === "conversion") newConversions++;
        }

        if (Math.random() < 0.05) {
          const fraudEvent = generateFraudEvent();
          bufferEvent(fraudEvent);
          newFraud = 1;
        }

        setEventCount((prev) => prev + baseEvents + newFraud);
        setImpressionCount((prev) => prev + newImpressions);
        setClickCount((prev) => prev + newClicks);
        setConversionCount((prev) => prev + newConversions);
        setFraudCount((prev) => prev + newFraud);
      }, 200);
    }
  };

  const handleStop = () => {
    if (isRunning) {
      setIsRunning(false);
      clearInterval(intervalRef.current);

      // Fix 2: Flush remaining buffer into queue on stop
      if (eventBufferRef.current.length > 0) {
        sendQueue.current.push([...eventBufferRef.current]);
        eventBufferRef.current = [];
        flushQueue();
      }
    }
  };

  const handleReset = () => {
    clearInterval(intervalRef.current);
    setIsRunning(false);

    setEventCount(0);
    setImpressionCount(0);
    setClickCount(0);
    setConversionCount(0);
    setFraudCount(0);

    // Fix 3: Use Date.now() so event_ids never repeat after reset
    nextEventId.current = Date.now();
    nextSessionId.current = 1000;

    eventBufferRef.current = [];
    sendQueue.current = [];
    activeSessionsRef.current.clear();
    sessionProfileRef.current.clear();
  };

  const impressionPercent = eventCount
    ? ((impressionCount / eventCount) * 100).toFixed(2)
    : 0;
  const clickPercent = eventCount
    ? ((clickCount / eventCount) * 100).toFixed(2)
    : 0;
  const conversionPercent = eventCount
    ? ((conversionCount / eventCount) * 100).toFixed(2)
    : 0;
  const fraudPercent = eventCount
    ? ((fraudCount / eventCount) * 100).toFixed(2)
    : 0;

  return (
    <div className="App">
      <h1>Ad Event Generator</h1>

      <button onClick={handleStart} disabled={isRunning}>Start</button>
      <button onClick={handleStop} disabled={!isRunning}>Stop</button>
      <button className="reset-btn" onClick={handleReset}>Reset</button>

      <h2>Total Events: {eventCount}</h2>

      <div className="stats">
        <div className="card">
          <h3>Impressions</h3>
          <p>{impressionCount}</p>
          <span>{impressionPercent}%</span>
        </div>

        <div className="card">
          <h3>Clicks</h3>
          <p>{clickCount}</p>
          <span>{clickPercent}%</span>
        </div>

        <div className="card">
          <h3>Conversions</h3>
          <p>{conversionCount}</p>
          <span>{conversionPercent}%</span>
        </div>

        <div className="card">
          <h3>Fraud</h3>
          <p>{fraudCount}</p>
          <span>{fraudPercent}%</span>
        </div>
      </div>
    </div>
  );
}

export default App;
