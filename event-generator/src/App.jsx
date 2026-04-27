import { useState, useRef, useEffect } from "react";
import "./App.css";

// API
const API_URL = "https://rexttiyzd1.execute-api.us-east-1.amazonaws.com/Prod/events";

// CONFIG
const BATCH_SIZE = 100;
const MAX_PARALLEL_REQUESTS = 10;

function App() {
  const [eventCount, setEventCount] = useState(0);
  const [impressionCount, setImpressionCount] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [conversionCount, setConversionCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const workerRef = useRef(null);
  const sendQueue = useRef([]);
  const buffer = useRef([]);

  const totalRef = useRef(0);
  const impressionRef = useRef(0);
  const clickRef = useRef(0);
  const conversionRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setEventCount(totalRef.current);
      setImpressionCount(impressionRef.current);
      setClickCount(clickRef.current);
      setConversionCount(conversionRef.current);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  //  FINAL FIXED SENDER
  const flushQueue = async () => {
    if (sendQueue.current.length === 0) return;

    const workers = [];

    for (let i = 0; i < MAX_PARALLEL_REQUESTS; i++) {
      workers.push(
        (async () => {
          while (sendQueue.current.length > 0) {
            const batch = sendQueue.current.shift();
            if (!batch) break;

            try {
              //  ENSURE campaign_id ALWAYS exists
              const safeBatch = (Array.isArray(batch) ? batch : [batch]).map(e => ({
                ...e,
                campaign_id: e.campaign_id || "default-key"
              }));

              console.log("Sending batch:", safeBatch); //  debug

              await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(safeBatch),
              });

            } catch (e) {
              console.error("API Error:", e);
            }
          }
        })()
      );
    }

    await Promise.all(workers);
  };

  const handleStart = () => {
    if (isRunning) return;

    setIsRunning(true);

    workerRef.current = new Worker(
      new URL("./eventWorker.js", import.meta.url)
    );

    workerRef.current.onmessage = (e) => {
      const events = e.data;

      totalRef.current += events.length;

      let imp = 0, clk = 0, conv = 0;

      for (let ev of events) {
        if (ev.event_type === "impression") imp++;
        else if (ev.event_type === "click") clk++;
        else if (ev.event_type === "conversion") conv++;
      }

      impressionRef.current += imp;
      clickRef.current += clk;
      conversionRef.current += conv;

      buffer.current.push(...events);

      if (buffer.current.length >= BATCH_SIZE) {
        const batch = buffer.current.splice(0, BATCH_SIZE);
        sendQueue.current.push(batch);
        flushQueue();
      }
    };

    workerRef.current.postMessage("start");
  };

  const handleStop = () => {
    setIsRunning(false);

    workerRef.current?.postMessage("stop");
    workerRef.current?.terminate();

    if (buffer.current.length > 0) {
      sendQueue.current.push([...buffer.current]);
      buffer.current = [];
      flushQueue();
    }
  };

  return (
    <div className="App">
      <h1>Event Generator</h1>

      <div style={{ marginBottom: "20px" }}>
        <button onClick={handleStart} disabled={isRunning}>Start</button>
        <button onClick={handleStop} disabled={!isRunning}>Stop</button>
      </div>

      <h2>Total Events: {eventCount}</h2>

      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        
        <div style={{ flex: 1, padding: "20px", background: "#4CAF50", color: "white", borderRadius: "10px" }}>
          <h3>Impressions</h3>
          <p>{impressionCount}</p>
        </div>

        <div style={{ flex: 1, padding: "20px", background: "#2196F3", color: "white", borderRadius: "10px" }}>
          <h3>Clicks</h3>
          <p>{clickCount}</p>
        </div>

        <div style={{ flex: 1, padding: "20px", background: "#FF9800", color: "white", borderRadius: "10px" }}>
          <h3>Conversions</h3>
          <p>{conversionCount}</p>
        </div>

      </div>
    </div>
  );
}

export default App;