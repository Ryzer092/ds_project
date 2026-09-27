import type { Metadata } from "next";
import { WishList } from "@/components/wishes/wish-list";

export const metadata: Metadata = { title: "マイ希望" };

export default function WishesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">マイ希望</h1>
      <WishList />
    </div>
  );
}
