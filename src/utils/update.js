import { config } from '../config.js'
import { getPluginsCollection } from './db.js'
import { loadCategories } from './categories.js'
import {
    fetchWithRetry,
    fetchPackageDetails,
    fetchInsecurePackages
} from './fetcher.js'
import semver from 'semver'

export async function checkForUpdates() {
    const collection = await getPluginsCollection()
    const params = new URLSearchParams({
        text: config.SEARCH_QUERY,
        size: config.SEARCH_SIZE,
        from: 0
    })

    // 并行获取搜索数据、现有插件和不安全包列表
    const [searchData, existingPlugins, insecurePackages] = await Promise.all([
        fetchWithRetry(`${config.NPM_SEARCH_URL}?${params}`),
        collection
            .find(
                {},
                {
                    projection: { 'package.name': 1, 'package.version': 1 }
                }
            )
            .toArray(),
        fetchInsecurePackages()
    ])

    // 创建现有版本的映射
    const existingVersions = new Map(
        existingPlugins.map((plugin) => [
            plugin.package.name,
            plugin.package.version
        ])
    )

    const packagesToUpdate = []
    const categories = await loadCategories()

    // 通过搜索结果筛选需要更新的包
    for (const result of searchData.objects || []) {
        const packageName = result.package?.name
        if (!config.VALID_PACKAGE_PATTERN.test(packageName)) continue

        const latestVersion = result.package.version
        const currentVersion = existingVersions.get(packageName)

        if (!currentVersion || semver.gt(latestVersion, currentVersion)) {
            packagesToUpdate.push({
                name: packageName,
                version: latestVersion,
                result: {
                    ...result,
                    category: categories.get(packageName) || 'other',
                    downloads: result.downloads || { all: 0 }
                }
            })
        }
    }

    if (packagesToUpdate.length === 0) {
        console.log('没有需要更新的包')
        return 0
    }

    // 并行获取需要更新的包的详细信息
    const updatesPromises = packagesToUpdate.map(async (p) => {
        return await fetchPackageDetails(p.name, p.result, insecurePackages)
    })

    const updates = (await Promise.all(updatesPromises)).filter(Boolean)

    if (updates.length > 0) {
        // 批量更新数据库
        const bulkOps = updates.map((update) => ({
            updateOne: {
                filter: { 'package.name': update.package.name },
                update: { $set: update },
                upsert: true
            }
        }))
        await collection.bulkWrite(bulkOps)

        // 输出更新信息
        console.log(`更新了 ${updates.length} 个有效包:`)
        updates.forEach((update) => {
            const currentVersion = existingVersions.get(update.package.name)
            const action = currentVersion ? '更新' : '新增'
            console.log(
                `- ${action}: ${update.package.name}@${update.package.version}${
                    currentVersion ? ` (原版本: ${currentVersion})` : ''
                }`
            )
        })
    } else {
        console.log('没有有效的包需要更新')
    }

    return updates.length
}
