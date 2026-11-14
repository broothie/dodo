import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import Plus from "lucide-react-native/icons/plus";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import { Link } from "expo-router";
import Head from "expo-router/head";
import { SectionList } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, H3, H4, Paragraph, Spinner, XStack, YStack } from "tamagui";
import { useTaskController } from "../hooks/use-task-controller";
import { Brand } from "./brand";
import { CountChip } from "./count-chip";
import { DueDialog } from "./due-dialog";
import { TaskComposer } from "./task-composer";
import { OutsideEditProvider } from "./task-edit-boundary";
import { TaskRow } from "./task-row";

export default function Tasks({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const controller = useTaskController(userId);
  const composer = controller.adding ? <TaskComposer {...controller.composer} /> : null;
  const { dueDialog } = controller;

  return (
    <OutsideEditProvider>
      <YStack flex={1} bg="background">
        <SafeAreaView style={{ flex: 1 }}>
          <Head><title>Dodo</title></Head>
          <YStack flex={1} w="100%" maxW={900} self="center" px="6" py="4" gap="4">
            <XStack items="center" justify="space-between" gap="3">
              <Brand />
              <Link href="/settings" asChild>
                <Button size="sm" circular variant="outlined" borderWidth={0} icon={EllipsisVertical} aria-label="Settings" />
              </Link>
            </XStack>
            <XStack items="center" gap="2">
              <H3>Tasks</H3>
              <CountChip count={controller.tasks.length} />
            </XStack>
            {!!controller.visibleError && (
              <YStack theme="red" bg="background" p="3" rounded="md" gap="3" role="alert">
                <Paragraph>{controller.visibleError}</Paragraph>
                <Button icon={RotateCw} onPress={controller.reload}>Retry</Button>
              </YStack>
            )}
            {controller.composerAnchor === null && composer}
            {controller.loading ? <Spinner aria-label="Loading tasks" /> : (
              <SectionList
                sections={controller.sections}
                stickySectionHeadersEnabled={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 96 }}
                renderSectionHeader={({ section }) => (
                  <XStack pt="3" pb="1" items="center" gap="2">
                    <H4 fontSize="sm" lineHeight="sm">{section.title}</H4>
                    <CountChip count={section.data.length} small />
                  </XStack>
                )}
                keyExtractor={task => task.id}
                ListEmptyComponent={
                  <YStack py="6">
                    <Paragraph>{controller.offline ? "Tasks unavailable offline" : "No tasks"}</Paragraph>
                  </YStack>
                }
                renderItem={({ item }) => (
                  <>
                    <TaskRow {...controller.row(item)} />
                    {controller.composerAnchor === item.id && composer}
                  </>
                )}
              />
            )}
          </YStack>
        </SafeAreaView>
        {!controller.adding && (
          <Button
            position="absolute"
            r={24 + insets.right}
            b={24 + insets.bottom}
            size="xl"
            iconSize={24}
            circular
            theme="accent"
            icon={Plus}
            aria-label="Create task"
            disabled={controller.loading || controller.offline || controller.busy}
            onPress={controller.beginAdding}
            shadowColor="shadow-color"
            shadowOffset={{ width: 0, height: 4 }}
            shadowOpacity={0.2}
            shadowRadius={8}
          />
        )}
        {dueDialog && <DueDialog key={dueDialog.key} due={dueDialog.due} busy={dueDialog.busy} onClose={dueDialog.onClose} onSave={dueDialog.onSave} />}
      </YStack>
    </OutsideEditProvider>
  );
}
