import { ComposerPage } from "../load";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ComposerPage id={id} />;
}
