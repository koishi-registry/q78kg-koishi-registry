import fetch from "node-fetch";
import { config } from "./config.js";

const NPM_SEARCH_URL = `${config.NPM_REGISTRY_BASE}/-/v1/search`;

async function fetchWithRetry(url, options, retries = config.MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: config.REQUEST_TIMEOUT,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function fetchPackageDetails(name, result) {
  try {
    const pkgUrl = `${config.NPM_REGISTRY_BASE}/${name}`;
    const pkgData = await fetchWithRetry(pkgUrl);

    const timeInfo = pkgData.time || {};
    const latestVersion = pkgData["dist-tags"]?.latest;
    const versionInfo = latestVersion ? pkgData.versions?.[latestVersion] : {};

    const publisher = {
      name: versionInfo._npmUser?.name || "",
      email: versionInfo._npmUser?.email || "",
      username: versionInfo._npmUser?.name || "",
    };

    const isVerified =
      publisher.name.toLowerCase() === "shigma" ||
      publisher.username.toLowerCase() === "shigma";

    const shortname = name.startsWith("@")
      ? `${name.split("/")[0]}/${name
          .split("/")[1]
          .replace("koishi-plugin-", "")}`
      : name.replace("koishi-plugin-", "");

    const manifest = versionInfo.koishi || pkgData.koishi || {};
    if (!manifest.description) {
      manifest.description = { zh: versionInfo.description || "" };
    }

    return {
      category: result.category || "other",
      shortname,
      createdAt: timeInfo.created,
      updatedAt: timeInfo.modified,
      updated: timeInfo.modified,
      portable: result.portable || false,
      verified: isVerified,
      score: {
        final: 0,
        detail: { quality: 0, popularity: 0, maintenance: 0 },
      },
      // ... 其他字段保持与原代码相同
      manifest,
      package: {
        name,
        version: latestVersion,
        description: versionInfo.description || "",
        publisher,
        // ... 其他包信息
      },
    };
  } catch (error) {
    console.error(`Error fetching ${name}:`, error);
    return null;
  }
}

export async function fetchKoishiPlugins() {
  const plugins = [];
  let fromOffset = 0;
  let totalPackages = null;

  while (true) {
    const params = new URLSearchParams({
      text: config.SEARCH_QUERY,
      size: config.SEARCH_SIZE,
      from: fromOffset,
    });

    const data = await fetchWithRetry(`${NPM_SEARCH_URL}?${params}`);

    if (!totalPackages) {
      totalPackages = data.total;
    }

    const results = data.objects || [];
    if (!results.length) break;

    const validPackages = results
      .filter((result) =>
        config.VALID_PACKAGE_PATTERN.test(result.package?.name)
      )
      .map((result) => ({ name: result.package.name, result }));

    // 并行处理包详情
    const batchPromises = validPackages.map(({ name, result }) =>
      fetchPackageDetails(name, result)
    );

    const batchResults = await Promise.all(batchPromises);
    plugins.push(...batchResults.filter(Boolean));

    fromOffset += results.length;
    console.log(`已收集 ${fromOffset}/${totalPackages} 个包...`);

    if (fromOffset >= totalPackages) break;
  }

  return plugins;
}
