import React, { useContext, useState } from "react";
import { Modal, Button, Table, Checkbox } from "@mantine/core";
import { SubscribeButton } from "../SubscribeButton/SubscribeButton";
import { MetadataContext } from "../../MetadataContext";
import { isClientTranscodeSupported } from "../../utils/clientTranscode";
import { t } from "../../i18n";

export const FileShareModal = (props: {
  closeModal: () => void;
  startFileShare: (
    useMediaSoup: boolean,
    options?: { convert?: boolean },
  ) => void;
}) => {
  const context = useContext(MetadataContext);
  const { closeModal } = props;
  const [convert, setConvert] = useState(false);
  const canConvert = isClientTranscodeSupported();
  const subscribeButton = <SubscribeButton />;
  return (
    <Modal
      opened
      onClose={closeModal}
      title={t("fileShare.title")}
      size="auto"
      centered
    >
      <div>{t("fileShare.about")}</div>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th>{t("plan.free")}</Table.Th>
            <Table.Th>{t("plan.plusRelay")}</Table.Th>
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
                  props.startFileShare(false, { convert });
                  props.closeModal();
                }}
              >
                {t("fileShare.start")}
              </Button>
            </Table.Td>
            <Table.Td>
              {context.isSubscriber ? (
                <Button
                  color="orange"
                  onClick={() => {
                    props.startFileShare(true, { convert });
                    props.closeModal();
                  }}
                >
                  {t("fileShare.startRelay")}
                </Button>
              ) : (
                subscribeButton
              )}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      <Checkbox
        mt="md"
        disabled={!canConvert}
        checked={convert}
        onChange={(e) => setConvert(e.currentTarget.checked)}
        label={t("fileShare.convert")}
        description={
          canConvert
            ? t("fileShare.convertDesc")
            : t("fileShare.convertUnsupported")
        }
      />
    </Modal>
  );
};
