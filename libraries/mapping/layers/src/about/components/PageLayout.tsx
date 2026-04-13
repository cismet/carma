interface PageLayoutProps {
  children: React.ReactNode;
}

const PageLayout = ({ children }: PageLayoutProps) => (
  <div
    style={{
      padding: "32px 24px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: "#f5f7fa",
      minHeight: "100vh",
    }}
  >
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>{children}</div>
  </div>
);

export default PageLayout;
