import React, { useContext, useState } from "react";
import { Menu } from "@mantine/core";
import { Socket } from "socket.io-client";
// import styles from './UserMenu.module.css';
import { MetadataContext } from "../../MetadataContext";
import { IconBan, IconTrashFilled, IconX } from "@tabler/icons-react";
import { t } from "../../i18n";

export const UserMenu = ({
  socket,
  userToManage,
  trigger,
  displayName,
  disabled,
  timestamp,
  isChatMessage,
}: {
  socket: Socket;
  userToManage: string;
  trigger: React.ReactNode;
  icon?: string;
  displayName?: string;
  disabled: boolean;
  timestamp?: string;
  isChatMessage?: boolean;
}) => {
  const { features } = useContext(MetadataContext);
  if (!features.roomControls) return <>{trigger}</>;
  return (
    <Menu
      closeOnItemClick
      closeOnClickOutside
      disabled={disabled}
      trigger="click"
    >
      <Menu.Target>{trigger}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{displayName}</Menu.Label>
        {isChatMessage && (
          <Menu.Item
            leftSection={<IconX />}
            onClick={async () => {
              socket.emit("CMD:deleteChatMessages", {
                author: userToManage,
                timestamp: timestamp,
              });
            }}
          >
            {t("userMenu.deleteMessage")}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<IconTrashFilled />}
          onClick={async () => {
            socket.emit("CMD:deleteChatMessages", {
              author: userToManage,
            });
          }}
        >
          {t("userMenu.deleteUserMessages")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBan />}
          onClick={async () => {
            socket.emit("CMD:kickUser", {
              userToBeKicked: userToManage,
            });
          }}
        >
          {t("userMenu.kick")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
