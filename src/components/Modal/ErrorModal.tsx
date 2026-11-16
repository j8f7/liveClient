import React from "react";
import { Modal, Button, Text } from "@mantine/core";
import { IconHome, IconRefresh } from "@tabler/icons-react";
import { t } from "../../i18n";
import { lobbyHref } from "../../config";

export const ErrorModal = ({
  error,
  code,
  onRetry,
}: {
  error: string;
  // Startup error code (see utils/startupError.ts), shown so the viewer can send it to the admin.
  code?: string;
  // Retry without a full reload; falls back to reloading the page.
  onRetry?: () => void;
}) => {
  return (
    <Modal opened onClose={() => {}} title={error} centered>
      {code && (
        <div style={{ marginBottom: 12, textAlign: "center" }}>
          <Text size="sm">
            {t("app.errorCode")}: <code style={{ userSelect: "all" }}>{code}</code>
          </Text>
          <Text size="sm" c="dimmed">
            {t("app.sendToAdmin")}
          </Text>
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <Button
          size="xl"
          onClick={() => {
            if (onRetry) onRetry();
            else window.location.reload();
          }}
          leftSection={<IconRefresh />}
        >
          {code ? t("app.retryConnect") : t("home.tryAgain")}
        </Button>
        <Button
          size="xl"
          onClick={() => {
            window.location.href = lobbyHref;
          }}
          leftSection={<IconHome />}
        >
          {t("error.goHome")}
        </Button>
      </div>
    </Modal>
  );
};
