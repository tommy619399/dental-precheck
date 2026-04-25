import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class AdminErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "管理员模块发生异常",
    };
  }

  componentDidCatch(error: Error): void {
    console.error("Admin portal render error:", error);
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <section className="panel-card">
        <h2>管理员模块加载失败</h2>
        <p>请把这段错误信息发给开发者：</p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #e7c9a3",
            background: "#fff8ef",
          }}
        >
          {this.state.message}
        </pre>
      </section>
    );
  }
}
