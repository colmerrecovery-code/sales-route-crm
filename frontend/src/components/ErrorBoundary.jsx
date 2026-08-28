import { Component } from 'react';

/** Catches crashes in a page so the app shows what went wrong instead of a blank screen. */
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="eyebrow">Something went wrong</div>
        <h1>This page hit an error</h1>
        <p className="muted">The rest of the app still works. Copy the message below and send it to whoever maintains the app.</p>
        <pre className="card" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.error?.stack || this.state.error)}</pre>
        <a className="btn" href="/">Back to Today</a>
      </div>
    );
  }
}
