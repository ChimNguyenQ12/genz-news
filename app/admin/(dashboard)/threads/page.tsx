import SocialPostManager from "@/components/admin/SocialPostManager";
import ThreadsAccountPanel from "@/components/admin/ThreadsAccountPanel";

export default function ThreadsAdminPage() {
  return (
    <>
      <ThreadsAccountPanel />
      <SocialPostManager platform="threads" />
    </>
  );
}
