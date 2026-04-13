interface PageHeaderProps {
  title: string;
}

const PageHeader = ({ title }: PageHeaderProps) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
    }}
  >
    <h1
      style={{
        margin: 0,
        fontSize: 24,
        fontWeight: 700,
        color: "#2d3748",
      }}
    >
      {title}
    </h1>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: 5,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <a href="https://cismet.de">
          <img
            src="https://cismet.de/images/cismet_signet_rgb_buntesC.png"
            alt="cismet logo"
            style={{ height: 36 }}
          />
        </a>
        <p
          style={{
            color: "rgb(100,100,100)",
            textShadow: "0 1px 1px rgba(250,250,250,0.9)",
            margin: "2px 0 0",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          one step ahead
        </p>
      </div>
    </div>
  </div>
);

export default PageHeader;
