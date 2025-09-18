import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: any };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error } as State;
  }
  componentDidCatch(error: any, info: any) {
    // Log pour debug
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? String(this.state.error ?? 'Erreur inconnue');
      return (
        <div style={{
          border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b',
          padding: '12px 14px', borderRadius: 8
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Une erreur est survenue.</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{msg}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

