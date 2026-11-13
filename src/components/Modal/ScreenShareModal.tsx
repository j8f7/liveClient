import React, { useContext } from "react";
import { Modal, Button, Table } from "@mantine/core";
import { SubscribeButton } from "../SubscribeButton/SubscribeButton";
import { MetadataContext } from "../../MetadataContext";
import { t } from "../../i18n";

export const ScreenShareModal = ({
  closeModal,
  startScreenShare,
}: {
  closeModal: () => void;
  startScreenShare: (useMediaSoup: boolean) => void;
}) => {
  const { isSubscriber } = useContext(MetadataContext);
  const subscribeButton = <SubscribeButton />;
  return (
    <Modal
      opened={true}
      onClose={closeModal}
      title={t("screenShare.title")}
      centered
      size="auto"
    >
      <div>{t("screenShare.about")}</div>
      <ul>
        <li>{t("screenShare.browserOnly")}</li>
        <li>{t("screenShare.audioNote")}</li>
      </ul>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th>{t("plan.free")}</Table.Th>
            <Table.Th>WatchParty Plus</Table.Th>
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          <Table.Tr>
            <Table.Td>{t("compare.method")}</Table.Td>
            <Table.Td>{t("compare.methodDirect")}</Table.Td>
            <Table.Td>{t("compare.methodRelay")}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>{t("compare.latency")}</Table.Td>
            <Table.Td>{`<1s`}</Table.Td>
            <Table.Td>{`<1s`}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>{t("compare.maxViewers")}</Table.Td>
            <Table.Td>5</Table.Td>
            <Table.Td>20</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>{t("compare.uploadSpeed")}</Table.Td>
            <Table.Td>{t("compare.perViewer")}</Table.Td>
            <Table.Td>5 Mbps</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td></Table.Td>
            <Table.Td>
              <Button
                onClick={() => {
                  startScreenShare(false);
                  closeModal();
                }}
              >
                {t("screenShare.start")}
              </Button>
            </Table.Td>
            <Table.Td>
              {isSubscriber ? (
                <Button
                  color="orange"
                  onClick={() => {
                    startScreenShare(true);
                    closeModal();
                  }}
                >
                  {t("screenShare.startRelay")}
                </Button>
              ) : (
                subscribeButton
              )}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Modal>
  );
};
