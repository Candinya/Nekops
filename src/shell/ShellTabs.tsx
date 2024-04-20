import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Modal,
  rem,
  Tabs,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { IconBellFilled, IconCircleFilled, IconX } from "@tabler/icons-react";
import ShellTerminal from "@/shell/ShellTerminal.tsx";
import type { Event } from "@tauri-apps/api/event";
import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import {
  EventAckSSHWindowReady,
  EventIsSSHWindowReady,
  EventNewSSHName,
} from "@/events/name.ts";
import type { EventNewSSHPayload, SSHSingleServer } from "@/events/payload.ts";
import { Window } from "@tauri-apps/api/window";
import type { ShellState } from "@/types/shellState.ts";
import { useDisclosure, useListState } from "@mantine/hooks";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";

interface ShellTabProps {
  data: SSHSingleServer;
  state?: ShellState;
  isNewMessage?: boolean;
  close: () => void;
}
const ShellTab = ({ data, state, isNewMessage, close }: ShellTabProps) => {
  const theme = useMantineTheme();
  const colorState =
    state === "loading"
      ? theme.colors.yellow[6]
      : state === "active"
        ? theme.colors.green[6]
        : state === "terminated"
          ? theme.colors.red[6]
          : theme.colors.gray[6];

  const LeftIcon = isNewMessage ? IconBellFilled : IconCircleFilled;

  return (
    <Tabs.Tab
      value={data.nonce}
      color={data.color}
      leftSection={
        <LeftIcon
          size={12}
          style={{
            color: colorState,
          }}
        />
      }
      rightSection={
        <ActionIcon
          size="xs"
          variant="subtle"
          color={data.color}
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          <IconX />
        </ActionIcon>
      }
      component="div"
    >
      {data.name}
    </Tabs.Tab>
  );
};

interface ShellPanelProps {
  data: SSHSingleServer;
  setShellState: (state: ShellState) => void;
  setNewMessage: () => void;
}
const ShellPanel = ({
  data,
  setShellState,
  setNewMessage,
}: ShellPanelProps) => (
  <Tabs.Panel value={data.nonce} h="100%">
    <ShellTerminal
      nonce={data.nonce}
      server={data.access}
      jumpServer={data.jumpServer}
      setShellState={setShellState}
      setNewMessage={setNewMessage}
    />
  </Tabs.Panel>
);

interface TerminateConfirmModalProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  confirm: () => void;
}
const TerminateConfirmModal = ({
  open,
  onClose,
  itemName,
  confirm,
}: TerminateConfirmModalProps) => {
  return (
    <Modal
      title="Terminate confirmation"
      opened={open}
      onClose={onClose}
      centered
    >
      <Text>Are you sure to terminate :</Text>
      <Title order={3} my="md" c="red">
        {itemName}
      </Title>
      <Center mt="lg">
        <Group gap="sm">
          <Button variant="default" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" onClick={confirm}>
            Confirm
          </Button>
        </Group>
      </Center>
    </Modal>
  );
};

const ShellTabs = () => {
  // For components render
  const [tabsData, tabsDataHandlers] = useListState<SSHSingleServer>([]);
  const [tabsState, tabsStateHandlers] = useListState<ShellState>([]);
  const [tabsNewMessage, tabsNewMessageHandlers] = useListState<boolean>([]);
  // For events binding
  const tabsDataRef = useRef<SSHSingleServer[]>([]);
  const tabsStateRef = useRef<ShellState[]>([]);
  const tabsNewMessageRef = useRef<boolean[]>([]);
  // Bind state : setTabsData -> tabsData -> tabsDataRef
  useEffect(() => {
    tabsDataRef.current = tabsData;
  }, [tabsData]);
  useEffect(() => {
    tabsStateRef.current = tabsState;
  }, [tabsState]);
  useEffect(() => {
    tabsNewMessageRef.current = tabsNewMessage;
  }, [tabsNewMessage]);

  const [currentActiveTab, setCurrentActiveTab] = useState<string | null>(null);
  const currentActiveTabRef = useRef<string | null>(null);
  useEffect(() => {
    currentActiveTabRef.current = currentActiveTab;
  }, [currentActiveTab]);

  const newSSHEventListener = (ev: Event<EventNewSSHPayload>) => {
    for (const server of ev.payload.servers) {
      tabsDataHandlers.append(server);
      tabsStateHandlers.append("loading");
      tabsNewMessageHandlers.append(false);
      setCurrentActiveTab(server.nonce);
    }
  };

  // Close (terminate) confirm
  const [terminateConfirmIndex, setTerminateConfirmIndex] = useState(-1);
  const [
    isTerminateConfirmModalOpen,
    { open: openTerminateConfirmModal, close: closeTerminateConfirmModal },
  ] = useDisclosure(false);
  const doClose = (index: number) => {
    const newTabsLength = tabsData.length - 1;
    tabsDataHandlers.remove(index);
    tabsStateHandlers.remove(index);
    tabsNewMessageHandlers.remove(index);

    if (newTabsLength === 0) {
      // Close window
      Window.getCurrent().close();
    }
  };

  const closeTab = (nonce: string) => {
    const index = tabsDataRef.current.findIndex(
      (state) => state.nonce === nonce,
    );
    if (index != -1) {
      if (tabsStateRef.current[index] === "active") {
        setTerminateConfirmIndex(index);
        openTerminateConfirmModal();
      } else {
        doClose(index);
      }
    }
  };

  const setTabShellState = (newState: ShellState, nonce: string) => {
    const index = tabsDataRef.current.findIndex(
      (state) => state.nonce === nonce,
    );
    if (tabsStateRef.current[index] !== "terminated") {
      tabsStateHandlers.setItem(index, newState);
    }
  };

  const setTabNewMessageState = (nonce: string) => {
    const index = tabsDataRef.current.findIndex(
      (state) => state.nonce === nonce,
    );
    if (currentActiveTabRef.current !== tabsDataRef.current[index].nonce) {
      tabsNewMessageHandlers.setItem(index, true);
    }
  };

  const clearTabNewMessageState = (nonce: string) => {
    const index = tabsDataRef.current.findIndex(
      (state) => state.nonce === nonce,
    );
    if (index > -1 && tabsNewMessageRef.current[index]) {
      tabsNewMessageHandlers.setItem(index, false);
    }
  };

  useEffect(() => {
    const stopSSHWindowReadyPromise = listen<string>(
      EventIsSSHWindowReady,
      async (ev) => {
        await emit(EventAckSSHWindowReady, ev.payload);
      },
    );
    const stopSSHListenPromise = listen<EventNewSSHPayload>(
      EventNewSSHName,
      newSSHEventListener,
    );

    return () => {
      (async () => {
        (await stopSSHWindowReadyPromise)();
        (await stopSSHListenPromise)();
      })();
    };
  }, []);

  return (
    <>
      <Tabs
        // variant="unstyled"
        // classNames={classes}
        h="100%"
        w="100%"
        display="flex"
        pos="absolute"
        style={{
          flexDirection: "column",
        }}
        value={currentActiveTab}
        onChange={(newActive) => {
          setCurrentActiveTab(newActive);
          if (newActive) {
            clearTabNewMessageState(newActive);
          }
        }}
        activateTabWithKeyboard={false}
      >
        <DragDropContext
          onDragEnd={({ destination, source }) => {
            const reorderOption = {
              from: source.index,
              to: destination?.index || 0,
            };

            tabsDataHandlers.reorder(reorderOption);
            tabsStateHandlers.reorder(reorderOption);
            tabsNewMessageHandlers.reorder(reorderOption);
          }}
        >
          <Droppable droppableId="shell-tabs" direction="horizontal">
            {(provided) => (
              <Tabs.List
                pr={rem(40)}
                ref={provided.innerRef}
                {...provided.droppableProps}
                data-tauri-drag-region
              >
                {tabsData.map((tabData, index) => (
                  <Draggable
                    key={tabData.nonce}
                    draggableId={tabData.nonce}
                    index={index}
                  >
                    {(provided) => (
                      <div
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        ref={provided.innerRef}
                      >
                        <ShellTab
                          data={tabData}
                          close={() => {
                            closeTab(tabData.nonce);
                          }}
                          state={tabsState[index]}
                          isNewMessage={tabsNewMessage[index]}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Tabs.List>
            )}
          </Droppable>
        </DragDropContext>

        <Box
          style={{
            flexGrow: 1,
            overflow: "clip",
          }}
        >
          {tabsData.map((tabData) => (
            <ShellPanel
              key={tabData.nonce}
              data={tabData}
              setShellState={(state) => {
                setTabShellState(state, tabData.nonce);
              }}
              setNewMessage={() => {
                setTabNewMessageState(tabData.nonce);
              }}
            />
          ))}
        </Box>
      </Tabs>

      <TerminateConfirmModal
        open={isTerminateConfirmModalOpen}
        onClose={closeTerminateConfirmModal}
        itemName={
          terminateConfirmIndex > -1 && terminateConfirmIndex < tabsData.length
            ? tabsData[terminateConfirmIndex].name
            : ""
        }
        confirm={() => {
          closeTerminateConfirmModal();
          setTerminateConfirmIndex(-1);
          doClose(terminateConfirmIndex);
        }}
      />
    </>
  );
};

export default ShellTabs;
