import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import schema from '../schemas/koishi-plugin-schema.json' with { type: 'json' }

// 初始化验证器
const ajv = new Ajv({
  allErrors: true,
  // 不要求所有属性都存在，只验证存在的属性是否符合规范
  strictRequired: false,
  // 允许缺少必需属性
  removeAdditional: false,
  useDefaults: true,
  coerceTypes: true
})
addFormats(ajv)
const validate = ajv.compile(schema)

/**
 * 验证 package.json 是否符合 Koishi 插件规范
 * @param {Object} pkgData package.json 数据
 * @returns {Object|null} 验证结果，如果不符合规范则返回 null
 */
export function validatePackage(pkgData) {
  if (!pkgData) {
    console.log(`Package validation failed: package data is null or undefined`)
    return null
  }

  // 使用 JSON Schema 进行验证
  const valid = validate(pkgData)
  if (!valid) {
    console.log(`Package validation failed: ${ajv.errorsText(validate.errors)}`)
    return null
  }

  return pkgData
}
