import React from "react";
import { Modal, Button, Table, Alert, Select, Avatar } from "@mantine/core";
import { SignInButton } from "../TopBar/TopBar";
import { serverPath } from "../../utils/utils";
import { SubscribeButton } from "../SubscribeButton/SubscribeButton";
import config from "../../config";
import { MetadataContext } from "../../MetadataContext";
import { IconHourglass } from "@tabler/icons-react";
import { t } from "../../i18n";

export class VBrowserModal extends React.Component<{
  closeModal: () => void;
  startVBrowser: (options: { size: string; region: string }) => void;
}> {
  static contextType = MetadataContext;
  declare context: React.ContextType<typeof MetadataContext>;
  state = {
    isFreePoolFull: false,
    region: "any",
  };

  async componentDidMount() {
    const resp = await fetch(serverPath + "/metadata");
    const metadata = await resp.json();
    this.setState({ isFreePoolFull: metadata.isFreePoolFull });
  }
  render() {
    const regionOptions = [
      {
        label: t("vb.regionAny"),
        value: "any",
        image: { avatar: false, src: "" },
      },
      {
        label: t("vb.regionUsEast"),
        value: "US",
        image: { avatar: false, src: "/flag-united-states.png" },
      },
      {
        label: t("vb.regionUsWest"),
        value: "USW",
        image: { avatar: false, src: "/flag-united-states.png" },
      },
      {
        label: t("vb.regionEurope"),
        value: "EU",
        image: { avatar: false, src: "/flag-european-union.png" },
      },
    ];
    const { closeModal, startVBrowser } = this.props;
    const LaunchButton = ({ large }: { large: boolean }) => {
      return (
        <Button
          color={large ? "orange" : undefined}
          onClick={async () => {
            startVBrowser({
              size: large ? "large" : "",
              region: this.state.region === "any" ? "" : this.state.region,
            });
            closeModal();
          }}
        >
          {large ? t("vb.launchPlus") : t("vb.continueFree")}
        </Button>
      );
    };
    const vmPoolFullMessage = (
      <Alert
        style={{ maxWidth: "300px" }}
        color="red"
        icon={<IconHourglass />}
        title={t("vb.poolFullTitle")}
      >
        <div>
          <div>{t("vb.poolFullBody1")}</div>
          <div>{t("vb.poolFullBody2")}</div>
        </div>
      </Alert>
    );

    const subscribeButton = <SubscribeButton />;

    const canLaunch = this.context.user || !config.VITE_FIREBASE_CONFIG;
    return (
      <Modal
        opened
        onClose={closeModal}
        title={t("vb.launchTitle")}
        centered
        size="auto"
      >
        <div>{t("vb.about")}</div>
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
              <Table.Td>{t("compare.maxViewers")}</Table.Td>
              <Table.Td>15</Table.Td>
              <Table.Td>30</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>{t("vb.region")}</Table.Td>
              <Table.Td>{t("vb.regionAvailable")}</Table.Td>
              <Table.Td>
                <Select
                  onChange={(value, option) => this.setState({ region: value })}
                  value={this.state.region}
                  data={regionOptions}
                  renderOption={({ option }: { option: any }) => (
                    <div
                      key={option.value}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <Avatar radius="xs" src={option.image.src} />
                      {option.label}
                    </div>
                  )}
                />
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td></Table.Td>
              <Table.Td>
                {canLaunch ? (
                  this.state.isFreePoolFull ? (
                    vmPoolFullMessage
                  ) : (
                    <LaunchButton large={false} />
                  )
                ) : (
                  <SignInButton />
                )}
              </Table.Td>
              <Table.Td>
                {this.context.isSubscriber ? (
                  <LaunchButton large />
                ) : (
                  subscribeButton
                )}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Modal>
    );
  }
}
