import { useState, useEffect } from "react";
import Login from "./components/Login";
import Dashboard from "./dashboard";
import { getSession } from "./auth/cognito";

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking

  useEffect(() => {
    getSession().then((session) => setAuthed(!!session));
  }, []);

  if (authed === null) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0f1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#8b8fa8",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        fontSize: "14px",
      }}>
        Loading…
      </div>
    );
  }

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return <Dashboard onSignOut={() => setAuthed(false)} />;
}
