import fetch from 'node-fetch'
import { config } from '../config'

const UNSAFE_DEPENDENCIES = new Set(['sharp', 'puppeteer', 'canvas'])

class InsecurePackagesManager {
  insecurePackages: Set<string> | null
  loading: Promise<Set<string>> | null
  constructor() {
    this.insecurePackages = null
    this.loading = null
  }

  async fetchWithRetry(url: string): Promise<unknown> {
    let lastError: any

    for (let i = 0; i < config.MAX_RETRIES; i++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(
          () => controller.abort(),
          config.REQUEST_TIMEOUT
        )
        const response = await fetch(url, { signal: controller.signal })
        clearTimeout(timeoutId)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return await response.json()
      } catch (error) {
        lastError = error
        console.error(`第 ${i + 1} 次获取不安全包列表失败:`, error)
        if (i < config.MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }
    throw lastError
  }

  async loadInsecurePackages(): Promise<Set<string>> {
    // 如果已经有缓存的数据，直接返回
    if (this.insecurePackages) {
      return this.insecurePackages
    }

    // 如果正在加载，等待加载完成并返回结果
    if (this.loading) {
      return this.loading
    }

    // 开始新的加载过程
    this.loading = this.fetchInsecurePackages()
    try {
      const data = await this.loading
      this.insecurePackages = data
      return data
    } finally {
      this.loading = null
    }
  }

  async fetchInsecurePackages(): Promise<Set<string>> {
    try {
      const data = (await this.fetchWithRetry(
        config.INSECURE_PACKAGES_URL
      )) as string[]
      return new Set(data)
    } catch (error) {
      console.error('不安全包列表加载失败（已尝试所有重试）:', error)
      return new Set()
    }
  }

  async isPackageInsecure(
    packageName: string,
    packageData: any = null
  ): Promise<boolean> {
    const insecurePackages = await this.loadInsecurePackages()

    if (insecurePackages.has(packageName)) {
      return true
    }

    if (packageData) {
      return this.checkDependenciesForUnsafePackages(packageData)
    }

    return false
  }

  checkDependenciesForUnsafePackages(packageData: {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
  }): boolean {
    const allDeps = {
      ...packageData.dependencies,
      ...packageData.devDependencies,
      ...packageData.peerDependencies,
      ...packageData.optionalDependencies
    }

    for (const depName of Object.keys(allDeps)) {
      if (UNSAFE_DEPENDENCIES.has(depName)) {
        return true
      }
    }

    return false
  }
}

// 创建单例
const insecurePackagesManager = new InsecurePackagesManager()

// 导出新的接口
export const loadInsecurePackages = (): Promise<Set<string>> =>
  insecurePackagesManager.loadInsecurePackages()
export const isPackageInsecure = (packageName: string, packageData?: any) =>
  insecurePackagesManager.isPackageInsecure(packageName, packageData)
