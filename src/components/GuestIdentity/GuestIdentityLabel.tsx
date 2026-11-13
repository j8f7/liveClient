import { useContext, useEffect, useState } from "react";
import { MetadataContext } from "../../MetadataContext";
import { getGuestIdentity } from "../../utils/guestIdentity";
import { t } from "../../i18n";

export function GuestIdentityLabel() {
  const { user } = useContext(MetadataContext);
  const [name, setName] = useState("");
  useEffect(() => {
    let active = true;
    if (!user) getGuestIdentity().then((identity) => { if (active) setName(identity.name); });
    return () => { active = false; };
  }, [user]);
  if (user) return null;
  // The provider link sits inside the sentence, so the sentence is split around it.
  const [ipBefore = "", ipAfter = ""] = t("guest.ipLocation").split("{link}");
  return <aside aria-label={t("guest.aria")} style={{ padding: "12px 24px", color: "var(--mantine-color-dimmed)", fontSize: 13 }}>
    <span aria-live="polite">{name ? <>{t("guest.joiningAs")} <strong>{name}</strong></> : t("guest.preparing")}</span>
    <span style={{ marginLeft: 12 }}>{ipBefore}<a href="https://db-ip.com" target="_blank" rel="noreferrer">DB-IP</a>{ipAfter}</span>
  </aside>;
}
