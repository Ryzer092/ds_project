import type { Metadata } from "next";
import { SearchWorkspace } from "@/components/search/search-workspace";

export const metadata: Metadata = { title: "相談・検索" };

export default function SearchPage() {
  return <SearchWorkspace />;
}
