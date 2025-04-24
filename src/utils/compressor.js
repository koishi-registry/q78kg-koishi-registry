import { minify } from 'terser'

/**
 * Compresses a JSON object using Terser
 * @param {Object} data - The data object to compress
 * @returns {Promise<string>} - The compressed JSON string
 */
export async function compressJson(data) {
    try {
        // Convert data to JSON string
        const jsonString = JSON.stringify(data)

        // Compress the JSON string using Terser
        const minified = await minify(jsonString, {
            compress: true,
            mangle: false,
            format: {
                beautify: false
            }
        })

        return minified.code
    } catch (error) {
        console.error('压缩JSON时出错:', error)
        // Fallback to regular JSON stringification
        return JSON.stringify(data)
    }
}
