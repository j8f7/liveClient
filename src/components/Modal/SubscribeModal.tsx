import React from "react";
import { Modal, Title, Table, Button } from "@mantine/core";
import { SignInButton } from "../TopBar/TopBar";
import config from "../../config";
import { MetadataContext } from "../../MetadataContext";
import { IconBrandStripeFilled, IconCheck } from "@tabler/icons-react";
import { serverPath } from "../../utils/utils";
import { t } from "../../i18n";

export class SubscribeModal extends React.Component<{
  closeSubscribe: () => void;
}> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  onSubscribe = async () => {
    try {
      const user = this.context.user;
      const resp = await fetch(`${serverPath}/checkoutSub`, {
        credentials: "include",
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: user?.uid,
          token: await user?.getIdToken(),
          return_url: window.location.href,
        }),
      });
      const json = await resp.json();
      if (json?.url) {
        // Go to the checkout page
        window.location.href = json.url;
      } else {
        throw Error();
      }
    } catch (e) {
      console.error(e);
    }
  };
  render() {
    const { closeSubscribe } = this.props;
    return (
      <Modal
        opened
        onClose={closeSubscribe}
        centered
        size="auto"
        title={t("subscribe.modalTitle")}
      >
        <div>{t("subscribe.intro")}</div>
        <Title order={6}>{t("subscribe.features")}</Title>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th>{t("plan.free")}</Table.Th>
              <Table.Th>WatchParty Plus</Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {/* Priority support */}
            <Table.Tr>
              <Table.Td>{t("subscribe.syncFeature")}</Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("subscribe.permanentCount")}</Table.Td>
              <Table.Td>1</Table.Td>
              <Table.Td>20</Table.Td>
            </Table.Tr>
            {/* <Table.Tr>
                  <Table.Td>Max Room Capacity</Table.Td>
                  <Table.Td>20</Table.Td>
                  <Table.Td>100</Table.Td>
                </Table.Tr> */}
            <Table.Tr>
              <Table.Td>{t("subscribe.vbAccess")}</Table.Td>
              <Table.Td>{t("subscribe.vbAccessFree")}</Table.Td>
              <Table.Td>{t("subscribe.vbAccessPlus")}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("vb.maxResolution")}</Table.Td>
              <Table.Td>720p</Table.Td>
              <Table.Td>1080p</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("vb.cpuRam")}</Table.Td>
              <Table.Td>{t("vb.standard")}</Table.Td>
              <Table.Td>{t("vb.extra")}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("vb.sessionLength")}</Table.Td>
              <Table.Td>{t("vb.hours3")}</Table.Td>
              <Table.Td>{t("vb.hours24")}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("subscribe.region")}</Table.Td>
              <Table.Td></Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("subscribe.relay")}</Table.Td>
              <Table.Td></Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("subscribe.customUrls")}</Table.Td>
              <Table.Td></Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("subscribe.discordRole")}</Table.Td>
              <Table.Td></Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("subscribe.coloredNames")}</Table.Td>
              <Table.Td></Table.Td>
              <Table.Td>
                <IconCheck />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("subscribe.price")}</Table.Td>
              <Table.Td>{t("subscribe.priceFree")}</Table.Td>
              <Table.Td>{t("subscribe.pricePlus")}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        <div style={{ textAlign: "right" }}>
          {/* if user isn't logged in, provide login prompt */}
          {this.context.user && this.context.user.email ? (
            <Button
              leftSection={<IconBrandStripeFilled />}
              onClick={this.onSubscribe}
            >
              {t("subscribe.withStripe")}
            </Button>
          ) : (
            <div>
              {t("subscribe.signInPrompt")} <SignInButton />
            </div>
          )}
        </div>
      </Modal>
    );
  }
}
