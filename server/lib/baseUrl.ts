function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getBaseUrl(): string {
  const envUrl = process.env.BASE_URL || process.env.PUBLIC_BASE_URL;
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  // Railway environment detection
  const railwayStaticUrl = process.env.RAILWAY_STATIC_URL;
  if (railwayStaticUrl) {
    return trimTrailingSlash(railwayStaticUrl);
  }

  const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayPublicDomain) {
    return `https://${railwayPublicDomain}`;
  }

  // Replit environment detection
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) {
    return `https://${replitDomain}`;
  }

  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (replitDevDomain) {
    return `https://${replitDevDomain}`;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const isLiveMode = process.env.APP_MODE === "live";
  if (isProduction || isLiveMode) {
    return "https://divorceledger.live";
  }

  return "http://localhost:5000";
}

export function getBaseOrigin(): string | null {
  try {
    return new URL(getBaseUrl()).origin;
  } catch {
    return null;
  }
}
