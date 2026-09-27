import "server-only";
import { getSourcePolicy } from "@/lib/policies/source-policies";
import type { SourceStatus } from "@/lib/schemas/source";
import { getEnv, isDemoMode } from "@/lib/server/env";
import { AmazonProvider } from "./amazon";
import { DemoProvider } from "./demo";
import { RakutenProvider } from "./rakuten";
import type { SearchProvider } from "./types";

let providers: SearchProvider[] | null = null;

/**
 * SEARCH_MODE に応じた情報源。live ではキー不足時にデモへ切り替えない。
 * アダプターはトークン等を保持するため、プロセス内で使い回す。
 */
export function getProviders(): SearchProvider[] {
  if (providers) return providers;
  const env = getEnv();
  if (isDemoMode(env)) {
    providers = [new DemoProvider("rakuten"), new DemoProvider("amazon")];
    return providers;
  }
  providers = [
    new RakutenProvider(
      {
        applicationId: env.RAKUTEN_APPLICATION_ID,
        accessKey: env.RAKUTEN_ACCESS_KEY,
        affiliateId: env.RAKUTEN_AFFILIATE_ID,
        appOrigin: env.APP_ORIGIN,
        timeoutMs: env.PROVIDER_TIMEOUT_MS,
      },
      getSourcePolicy("rakuten"),
    ),
    new AmazonProvider(
      {
        credentialId: env.AMAZON_CREDENTIAL_ID,
        credentialSecret: env.AMAZON_CREDENTIAL_SECRET,
        credentialVersion: env.AMAZON_CREDENTIAL_VERSION,
        partnerTag: env.AMAZON_PARTNER_TAG,
        marketplace: env.AMAZON_MARKETPLACE,
        timeoutMs: env.PROVIDER_TIMEOUT_MS,
      },
      getSourcePolicy("amazon"),
    ),
  ];
  return providers;
}

export function setProvidersForTesting(p: SearchProvider[] | null) {
  providers = p;
}

export function getSourceStatuses(): SourceStatus[] {
  return getProviders().map((p) => ({ sourceId: p.sourceId, label: p.label, state: p.status(), demo: p.demo }));
}
