import { Component, Suspense, type ReactNode } from "react";

interface Props {
  readonly name: string;
  readonly children: ReactNode;
  readonly loading?: ReactNode;
  readonly fallback?: ReactNode;
}

export class PracticeSection extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return (
        <div role="alert">
          <p>{this.props.name} could not load.</p>
          <button
            type="button"
            className="review-action"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload Practice
          </button>
          {this.props.fallback}
        </div>
      );
    }

    return (
      <Suspense fallback={this.props.loading ?? null}>
        {this.props.children}
      </Suspense>
    );
  }
}
