import { useState } from "react";
import { signIn } from "../auth/cognito";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(username.trim(), password);
      onLogin();
    } catch (err) {
      setError(err.message || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoMark}>■</span>
          <span style={styles.logoText}>EventLens</span>
        </div>

        <p style={styles.subtitle}>Sign in to continue</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoComplete="username"
              style={styles.input}
              onFocus={(e) => (e.target.style.borderColor = "#c8ff00")}
              onBlur={(e)  => (e.target.style.borderColor = "#2a2d3a")}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              style={styles.input}
              onFocus={(e) => (e.target.style.borderColor = "#c8ff00")}
              onBlur={(e)  => (e.target.style.borderColor = "#2a2d3a")}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  card: {
    background: "#15171f",
    border: "1px solid #2a2d3a",
    borderRadius: "14px",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "380px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "6px",
  },
  logoMark: {
    color: "#c8ff00",
    fontSize: "22px",
  },
  logoText: {
    color: "#e8eaf0",
    fontSize: "20px",
    fontWeight: 700,
    letterSpacing: "0.5px",
  },
  subtitle: {
    color: "#8b8fa8",
    fontSize: "13px",
    margin: "0 0 28px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    color: "#8b8fa8",
    fontSize: "12px",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.6px",
  },
  input: {
    background: "#0f1117",
    border: "1px solid #2a2d3a",
    borderRadius: "8px",
    color: "#e8eaf0",
    fontSize: "14px",
    padding: "10px 14px",
    outline: "none",
    transition: "border-color 0.15s",
    width: "100%",
    boxSizing: "border-box",
  },
  error: {
    color: "#ff6b6b",
    fontSize: "13px",
    margin: 0,
    background: "rgba(255,107,107,0.08)",
    border: "1px solid rgba(255,107,107,0.2)",
    borderRadius: "6px",
    padding: "8px 12px",
  },
  btn: {
    background: "#c8ff00",
    color: "#0f1117",
    border: "none",
    borderRadius: "8px",
    padding: "11px",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
    letterSpacing: "0.3px",
    transition: "opacity 0.15s",
    marginTop: "4px",
  },
};
