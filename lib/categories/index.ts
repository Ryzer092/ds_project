import { desksCategory } from "./desks";
import type { AttributeDef, CategoryConfig } from "./types";

export type { AttributeDef, CategoryConfig } from "./types";

const CATEGORIES: Record<string, CategoryConfig> = {
  [desksCategory.id]: desksCategory,
};

export function listCategoryIds(): string[] {
  return Object.keys(CATEGORIES);
}

export function getCategory(id: string): CategoryConfig | null {
  return Object.prototype.hasOwnProperty.call(CATEGORIES, id) ? CATEGORIES[id] : null;
}

/** 初期カテゴリ。環境変数が不正な場合はデスクに戻す。 */
export function getInitialCategory(configuredId?: string | null): CategoryConfig {
  return (configuredId && getCategory(configuredId)) || desksCategory;
}

export function findAttribute(category: CategoryConfig, key: string): AttributeDef | null {
  return category.attributes.find((a) => a.key === key) ?? null;
}
