import React from "react";
import { t } from "../../i18n";

const mdStyle: React.CSSProperties = {
  maxWidth: "100vw",
  width: "800px",
  padding: "10px",
};

export const Privacy = () => {
  return (
    <div style={mdStyle}>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {t("pages.privacy")}
      </pre>
    </div>
  );
};

export const Terms = () => {
  return (
    <div style={mdStyle}>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {t("pages.terms")}
      </pre>
    </div>
  );
};

export const FAQ = () => {
  return (
    <div style={mdStyle}>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {t("pages.faq")}
      </pre>
    </div>
  );
};
