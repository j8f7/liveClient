import React from "react";
import { Link } from "react-router-dom";
import { softWhite } from "../../utils/utils";
import { t } from "../../i18n";

export const Footer = () => (
  <div
    style={{
      margin: "1em",
      paddingBottom: "1em",
      fontSize: "14px",
      color: softWhite,
    }}
  >
    <Link to="/terms">{t("footer.terms")}</Link>
    {" · "}
    <Link to="/privacy">{t("footer.privacy")}</Link>
    {" · "}
    <Link to="/faq">{t("footer.faq")}</Link>
  </div>
);
