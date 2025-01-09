import fetch from 'node-fetch'
import { config } from '../config.js'
import { calculatePackageScore } from './scoring.js'
import { getCategory, loadCategories } from './categories.js'
import semver from 'semver'
import { loadInsecurePackages } from './insecure.js'

// 获取包的短名称
function getPackageShortname(name) {
    if (name.startsWith('@koishijs/')) {
        return name.replace('@koishijs/plugin-', '')
    } else if (name.startsWith('@')) {
        const [scope, pkgName] = name.split('/')
        return `${scope}/${pkgName.replace('koishi-plugin-', '')}`
    } else {
        return name.replace('koishi-plugin-', '')
    }
}

// 验证包是否为官方包
function isVerifiedPackage(name) {
    return name.startsWith('@koishijs/')
}

// 导出 fetchWithRetry
export async function fetchWithRetry(
    url,
    options,
    retries = config.MAX_RETRIES
) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                timeout: config.REQUEST_TIMEOUT
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            return await response.json()
        } catch (error) {
            if (i === retries - 1) throw error
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }
    }
}

// 导出 fetchPackageDetails
export async function fetchPackageDetails(name, result) {
    try {
        const pkgUrl = `${config.NPM_REGISTRY}/${name}`
        const pkgData = await fetchWithRetry(pkgUrl)

        const latestVersion = pkgData['dist-tags']?.latest
        const versionInfo = latestVersion
            ? pkgData.versions?.[latestVersion]
            : {}

        // 检查包是否被弃用
        if (versionInfo.deprecated || pkgData.deprecated) {
            return null
        }

        // 检查是否有 peerDependencies
        const peerDeps = versionInfo.peerDependencies || {}
        if (!peerDeps.koishi) {
            return null
        }

        // 检查 koishi 版本要求
        const versionRequirement = peerDeps.koishi
        const intersection = semver.intersects(
            versionRequirement,
            config.KOISHI_VERSION_REQUIREMENT
        )
        if (!intersection) {
            return null
        }

        const koishiManifest = versionInfo.koishi || pkgData.koishi || {}
        if (koishiManifest.hidden === true) {
            return null
        }

        const timeInfo = pkgData.time || {}
        const publisher = {
            name: versionInfo._npmUser?.name || '',
            email: versionInfo._npmUser?.email || '',
            username: versionInfo._npmUser?.name || ''
        }

        const maintainers = (pkgData.maintainers || []).map((maintainer) => ({
            name: maintainer.name || '',
            email: maintainer.email || '',
            username: maintainer.name || ''
        }))

        const contributors = (versionInfo.contributors || []).map(
            (contributor) => {
                if (typeof contributor === 'string') {
                    return { name: contributor }
                }
                return {
                    name: contributor.name || '',
                    email: contributor.email || '',
                    url: contributor.url || '',
                    username: contributor.name || ''
                }
            }
        )

        const npmLink = name.startsWith('@')
            ? `${config.NPM_PACKAGE_URL}/${name}`
            : `${config.NPM_PACKAGE_URL}/package/${name}`

        const packageLinks = {
            npm: npmLink,
            bugs: versionInfo.bugs?.url || '',
            homepage: versionInfo.homepage || '',
            repository:
                typeof versionInfo.repository === 'object'
                    ? versionInfo.repository.url || ''
                    : versionInfo.repository || ''
        }

        const isVerified = isVerifiedPackage(name)
        const shortname = getPackageShortname(name)

        if (!koishiManifest.description) {
            koishiManifest.description = { zh: versionInfo.description || '' }
        }

        // 计算评分
        const score = calculatePackageScore({
            packageInfo: pkgData,
            versionInfo,
            timeInfo,
            maintainers,
            contributors,
            packageLinks
        })

        // 从 search 结果中获取下载量
        const downloads = {
            lastMonth: result.downloads?.all || 0
        }

        // 使用新的缓存机制获取不安全包列表
        const insecurePackages = await loadInsecurePackages()
        const isInsecure =
            insecurePackages.has(name) || koishiManifest.insecure === true

        return {
            category: result.category || 'other',
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
                    maintenance: score.maintenance
                }
            },
            rating: score.final,
            license: versionInfo.license || pkgData.license || '',
            package: {
                name,
                keywords: versionInfo.keywords || [],
                version: latestVersion,
                description: versionInfo.description || '',
                publisher,
                maintainers,
                license: versionInfo.license || pkgData.license || '',
                date: timeInfo[latestVersion],
                links: packageLinks,
                contributors
            },
            flags: {
                insecure: isInsecure ? 1 : 0
            },
            manifest: koishiManifest,
            publishSize: versionInfo.dist?.unpackedSize || 0,
            installSize: versionInfo.dist?.size || 0,
            dependents: 0,
            downloads,
            insecure: isInsecure,
            ignored: false
        }
    } catch (error) {
        console.error(`Error fetching ${name}:`, error)
        return null
    }
}

// 导出 getCategoryForPackage
export const getCategoryForPackage = getCategory

export async function fetchKoishiPlugins() {
    // 预加载分类和不安全包列表
    const [categories, _insecurePackages] = await Promise.all([
        loadCategories(),
        loadInsecurePackages()
    ])

    const plugins = []
    let fromOffset = 0
    let totalPackages = null
    let skippedPackages = 0

    while (true) {
        const params = new URLSearchParams({
            text: config.SEARCH_QUERY,
            size: config.SEARCH_SIZE,
            from: fromOffset
        })

        const data = await fetchWithRetry(`${config.NPM_SEARCH_URL}?${params}`)

        if (!totalPackages) {
            totalPackages = data.total
        }

        const results = data.objects || []
        if (!results.length) break

        // 预处理所有有效的包，包括它们的分类信息
        const validPackages = results
            .filter((result) =>
                config.VALID_PACKAGE_PATTERN.test(result.package?.name)
            )
            .map((result) => ({
                name: result.package.name,
                result: {
                    ...result,
                    category: categories.get(result.package.name) || 'other',
                    downloads: result.downloads || { all: 0 }
                }
            }))

        // 并行处理包详情，传入预加载的不安全包列表
        const batchPromises = validPackages.map(({ name, result }) =>
            fetchPackageDetails(name, result)
        )

        const batchResults = await Promise.all(batchPromises)
        const validResults = batchResults.filter(Boolean)
        skippedPackages += batchResults.length - validResults.length
        plugins.push(...validResults)

        fromOffset += results.length
        console.log(
            `进度: ${fromOffset}/${totalPackages} | 已收录: ${plugins.length} | 已跳过: ${skippedPackages}`
        )

        if (fromOffset >= totalPackages) break
    }

    console.log(`\n扫描完成：`)
    console.log(`- 总扫描数量: ${totalPackages}`)
    console.log(`- 最终收录: ${plugins.length}`)
    console.log(`- 已跳过: ${skippedPackages}`)

    return plugins
}
