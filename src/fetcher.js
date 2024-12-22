import fetch from "node-fetch";
import { config } from "./config.js";
import { calculatePackageScore } from "./utils/scoring.js";

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

    const maintainers = (pkgData.maintainers || []).map((maintainer) => ({
      name: maintainer.name || "",
      email: maintainer.email || "",
      username: maintainer.name || "",
    }));

    const contributors = (versionInfo.contributors || []).map((contributor) => {
      if (typeof contributor === "string") {
        return { name: contributor };
      }
      return {
        name: contributor.name || "",
        email: contributor.email || "",
        url: contributor.url || "",
        username: contributor.name || "",
      };
    });

    const npmLink = name.startsWith("@")
      ? `${config.NPM_PACKAGE_URL}/${name}`
      : `${config.NPM_PACKAGE_URL}/package/${name}`;

    const packageLinks = {
      npm: npmLink,
      bugs: versionInfo.bugs?.url || "",
      homepage: versionInfo.homepage || "",
      repository:
        typeof versionInfo.repository === "object"
          ? versionInfo.repository.url || ""
          : versionInfo.repository || "",
    };

    const isVerified = name.startsWith('@koishijs/');

    const shortname = (() => {
      if (name.startsWith('@koishijs/')) {
        return name.replace('@koishijs/plugin-', '');
      } else if (name.startsWith('@')) {
        const [scope, pkgName] = name.split('/');
        return `${scope}/${pkgName.replace('koishi-plugin-', '')}`;
      } else {
        return name.replace('koishi-plugin-', '');
      }
    })();

    const manifest = versionInfo.koishi || pkgData.koishi || {};
    if (!manifest.description) {
      manifest.description = { zh: versionInfo.description || "" };
    }

    // 计算评分
    const score = calculatePackageScore({
      packageInfo: pkgData,
      versionInfo,
      timeInfo,
      maintainers,
      contributors,
      packageLinks,
    });

    // 从 search 结果中获取下载量
    const downloads = {
      lastMonth: result.downloads?.lastMonth || 0,
    };

    return {
      category: result.category || "other",
      shortname,
      createdAt: timeInfo.created,
      updatedAt: timeInfo.modified,
      updated: timeInfo.modified,
      portable: result.portable || false,
      verified: isVerified,
      score: {
        final: score.final,
        detail: {
          quality: score.quality,
          popularity: score.popularity,
          maintenance: score.maintenance,
        },
      },
      rating: score.final,
      license: versionInfo.license || pkgData.license || "",
      package: {
        name,
        keywords: versionInfo.keywords || [],
        version: latestVersion,
        description: versionInfo.description || "",
        publisher,
        maintainers,
        license: versionInfo.license || pkgData.license || "",
        date: timeInfo[latestVersion],
        links: packageLinks,
        contributors,
      },
      flags: {
        insecure: 0,
      },
      manifest,
      publishSize: versionInfo.dist?.unpackedSize || 0,
      installSize: versionInfo.dist?.size || 0,
      dependents: 0,
      downloads,
      insecure: false,
      ignored: false,
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
      .map((result) => ({
        name: result.package.name,
        result: {
          ...result,
          downloads: result.downloads || { all: 0 }
        }
      }));

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
