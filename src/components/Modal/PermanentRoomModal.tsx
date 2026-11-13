import React from "react";
import { Modal, Table } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { t } from "../../i18n";

export const PermanentRoomModal = (props: { closeModal: () => void }) => {
  const { closeModal } = props;
  return (
    <Modal opened onClose={closeModal} title={t("permanent.title")}>
      <div>{t("permanent.intro")}</div>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th>{t("compare.temporary")}</Table.Th>
            <Table.Th>{t("compare.permanent")}</Table.Th>
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          <Table.Tr>
            <Table.Td>{t("permanent.expiry")}</Table.Td>
            <Table.Td>{t("permanent.expiryTemporary")}</Table.Td>
            <Table.Td>{t("permanent.never")}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>{t("permanent.passwords")}</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>{t("permanent.disableChat")}</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>{t("permanent.kick")}</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>{t("permanent.customUrls")}</Table.Td>
            <Table.Td></Table.Td>
            <Table.Td>
              <IconCheck />
            </Table.Td>
          </Table.Tr>
          {/* <Table.Tr>
                  <Table.Td>Max Room Capacity (subscribers)</Table.Td>
                    <Table.Td>20</Table.Td>
                    <Table.Td>100</Table.Td>
                  </Table.Tr> */}
        </Table.Tbody>
      </Table>
    </Modal>
  );
};
