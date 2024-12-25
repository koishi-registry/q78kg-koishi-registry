import { config } from './config.js'
import { getPluginsCollection } from './utils/db.js'
import { loadCategories } from './utils/categories.js'
import { fetchWithRetry, fetchPackageDetails, fetchInsecurePackages } from './fetcher.js'
import semver from 'semver'

export async function checkForUpdates() {
    const collection = await getPluginsCollection()
    const plugins = await collection.find({}).toArray()
    const categories = await loadCategories()
    const insecurePackages = await fetchInsecurePackages()
    let updatedCount = 0

    for (const plugin of plugins) {
        try {
            const packageName = plugin.package.name
            const currentVersion = plugin.package.version

            // 获取最新的包信息
            const npmInfo = await fetchWithRetry(
                `${config.NPM_REGISTRY}/${packageName}`
            )

            if (!npmInfo) {
                console.warn(`无法获取包信息: ${packageName}`)
                continue
            }

            const latestVersion = npmInfo['dist-tags']?.latest
            if (!latestVersion) {
                console.warn(`无法获取最新版本: ${packageName}`)
                continue
            }

            // 检查是否需要更新
            if (semver.gt(latestVersion, currentVersion)) {
                console.log(
                    `发现更新: ${packageName} (${currentVersion} -> ${latestVersion})`
                )

                // 获取详细信息
                const details = await fetchPackageDetails(packageName, categories)
                if (!details) continue

                // 检查是否存在安全漏洞
                const isInsecure = insecurePackages.some(
                    (pkg) =>
                        pkg.name === packageName &&
                        semver.satisfies(latestVersion, pkg.range)
                )

                // 更新数据库
                await collection.updateOne(
                    { 'package.name': packageName },
                    {
                        $set: {
                            ...details,
                            isInsecure
                        }
                    }
                )

                updatedCount++
            }
        } catch (error) {
            console.error(`更新 ${plugin.package.name} 时出错:`, error)
        }
    }

    return updatedCount
}