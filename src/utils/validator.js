import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import schema from '../schemas/koishi-plugin-schema.json' assert { type: 'json' }

// 初始化验证器
const ajv = new Ajv({ allErrors: true })
addFormats(ajv)
const validate = ajv.compile(schema)

/**
 * 验证 package.json 是否符合 Koishi 插件规范
 * @param {Object} pkgData package.json 数据
 * @returns {Object|null} 验证结果，如果不符合规范则返回 null
 */
export function validatePackage(pkgData) {
  // 基本验证：必须有 name, version, peerDependencies
  if (!pkgData || !pkgData.name || !pkgData.version || !pkgData.peerDependencies) {
    console.log(`Package validation failed: missing required fields (name, version, or peerDependencies)`)
    return null
  }

  // 验证 name 格式
  const namePattern = /^(@koishijs\/plugin-[a-z0-9-]+|@[a-z0-9-]+\/koishi-plugin-[a-z0-9-]+|koishi-plugin-[a-z0-9-]+)$/
  if (!namePattern.test(pkgData.name)) {
    console.log(`Package validation failed: invalid name format - ${pkgData.name}`)
    return null
  }

  // 验证 peerDependencies 必须包含 koishi
  if (!pkgData.peerDependencies.koishi) {
    console.log(`Package validation failed: missing koishi in peerDependencies`)
    return null
  }

  // 验证 private 不能为 true
  if (pkgData.private === true) {
    console.log(`Package validation failed: private packages are not allowed`)
    return null
  }

  // 验证 contributors 必须是数组
  if (pkgData.contributors && !Array.isArray(pkgData.contributors)) {
    console.log(`Package validation failed: contributors must be an array`)
    return null
  }

  // 验证 koishi 字段
  const koishiManifest = pkgData.koishi || {}
  
  // 验证 hidden 字段位置是否正确
  if (koishiManifest.description && typeof koishiManifest.description === 'object' && koishiManifest.description.hidden !== undefined) {
    console.log(`Package validation failed: hidden field must be at koishi.hidden, not koishi.description.hidden`)
    return null
  }

  // 使用 JSON Schema 进行完整验证
  const valid = validate(pkgData)
  if (!valid) {
    console.log(`Package validation failed: ${ajv.errorsText(validate.errors)}`)
    return null
  }

  return pkgData
}
