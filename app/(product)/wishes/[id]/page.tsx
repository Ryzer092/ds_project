import type { Metadata } from "next";
import { WishDetail } from "@/components/wishes/wish-detail";

export const metadata: Metadata = { title: "希望の詳細" };

export default async function WishDetailPage(props: PageProps<"/wishes/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  return <WishDetail id={id} startEditing={sp.edit === "1"} />;
}
