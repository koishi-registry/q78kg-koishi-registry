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

    const isVerified =
      config.VERIFIED_PUBLISHERS.includes(publisher.name.toLowerCase()) ||
      config.VERIFIED_PUBLISHERS.includes(publisher.username.toLowerCase());

    const shortname = name.startsWith("@")
      ? `${name.split("/")[0]}/${name
          .split("/")[1]
          .replace("koishi-plugin-", "")}`
      : name.replace("koishi-plugin-", "");

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
      rating: result.rating || 0,
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
      downloads: {
        lastMonth: 0,
      },
      insecure: false,
      ignored: false,
    };
  } catch (error) {
    console.error(`Error fetching ${name}:`, error);
    return null;
  }
}

// 添加新的评分计算函数
function calculatePackageScore({
  packageInfo,
  versionInfo,
  timeInfo,
  maintainers,
  contributors,
  packageLinks,
}) {
  // 质量评分 (0-1)
  const quality = calculateQualityScore({
    hasDescription: !!versionInfo.description,
    hasRepository: !!packageLinks.repository,
    hasHomepage: !!packageLinks.homepage,
    hasBugs: !!packageLinks.bugs,
    hasTypes: !!versionInfo.types || !!versionInfo.typings,
    maintainersCount: maintainers.length,
    contributorsCount: contributors.length,
    hasLicense: !!versionInfo.license,
  });

  // 维护性评分 (0-1)
  const maintenance = calculateMaintenanceScore({
    lastUpdated: new Date(timeInfo.modified),
    commitFrequency: calculateCommitFrequency(timeInfo),
    maintainersCount: maintainers.length,
  });

  // 流行度评分 (0-1)
  const popularity = calculatePopularityScore({
    downloadCount: packageInfo.downloads?.lastMonth || 0,
    dependentsCount: packageInfo.dependents || 0,
    starsCount: 0, // 如果有 GitHub API 可以添加
  });

  // 最终评分 (0-1)
  const final = quality * 0.4 + maintenance * 0.35 + popularity * 0.25;

  return {
    final,
    quality,
    popularity,
    maintenance,
  };
}

function calculateQualityScore({
  hasDescription,
  hasRepository,
  hasHomepage,
  hasBugs,
  hasTypes,
  maintainersCount,
  contributorsCount,
  hasLicense,
}) {
  let score = 0;
  if (hasDescription) score += 0.2;
  if (hasRepository) score += 0.15;
  if (hasHomepage) score += 0.1;
  if (hasBugs) score += 0.1;
  if (hasTypes) score += 0.15;
  if (hasLicense) score += 0.1;
  score += Math.min(maintainersCount * 0.1, 0.1);
  score += Math.min(contributorsCount * 0.05, 0.1);
  return Math.min(score, 1);
}

function calculateMaintenanceScore({
  lastUpdated,
  commitFrequency,
  maintainersCount,
}) {
  const now = new Date();
  const monthsSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60 * 24 * 30);

  let score = 0;
  // 最近更新权重
  score += Math.max(0, 1 - monthsSinceUpdate / 12); // 一年内递减
  // 提交频率权重
  score += Math.min(commitFrequency, 1) * 0.5;
  // 维护者数量权重
  score += Math.min(maintainersCount * 0.2, 0.5);

  return Math.min(score / 2, 1);
}

function calculatePopularityScore({
  downloadCount,
  dependentsCount,
  starsCount,
}) {
  const downloadScore = Math.min(downloadCount / 1000, 1);
  const dependentsScore = Math.min(dependentsCount / 10, 1);
  const starsScore = Math.min(starsCount / 100, 1);

  return downloadScore * 0.6 + dependentsScore * 0.3 + starsScore * 0.1;
}

function calculateCommitFrequency(timeInfo) {
  const versions = Object.keys(timeInfo).filter(
    (key) => !["created", "modified"].includes(key)
  );
  if (versions.length < 2) return 0;

  const firstVersion = new Date(timeInfo[versions[0]]);
  const lastVersion = new Date(timeInfo[versions[versions.length - 1]]);
  const months = (lastVersion - firstVersion) / (1000 * 60 * 60 * 24 * 30);

  return months === 0 ? 0 : Math.min(versions.length / months, 1);
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
