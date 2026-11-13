import React, { useState } from "react";
import { ActionIcon } from "@mantine/core";
import { InviteModal } from "../Modal/InviteModal";
import { IconUserPlus } from "@tabler/icons-react";
import { t } from "../../i18n";

export const InviteButton = () => {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  return (
    <>
      {inviteModalOpen && (
        <InviteModal closeInviteModal={() => setInviteModalOpen(false)} />
      )}
      <ActionIcon
        size="36px"
        color="peach"
        variant="light"
        title={t("invite.label")}
        aria-label={t("invite.label")}
        onClick={() => setInviteModalOpen(true)}
      >
        <IconUserPlus />
      </ActionIcon>
    </>
  );
};
