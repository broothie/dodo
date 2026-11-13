import { AuthGate } from "../components/auth-gate";
import { Settings } from "../components/settings";

export default function SettingsPage() {
  return <AuthGate>{user => <Settings user={user} />}</AuthGate>;
}
