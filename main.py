import requests
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing
from datetime import datetime
import time
from flask import Flask, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

SERVER_HOST = '0.0.0.0'
SERVER_PORT = 3000
SCAN_CRON = "*/10 * * * *"

# API 配置
MAX_RETRIES = 3
REQUEST_TIMEOUT = 10
OPTIMAL_WORKERS_MULTIPLIER = 5

# NPM 相关配置
NPM_REGISTRY_BASE = "https://registry.npmmirror.com"
NPM_SEARCH_URL = f"{NPM_REGISTRY_BASE}/-/v1/search"
NPM_PACKAGE_URL = "https://www.npmjs.com"
SEARCH_QUERY = "koishi-plugin-"
SEARCH_SIZE = 10000
VALID_PACKAGE_PATTERN = r"^(?:@[^/]+/)?koishi-plugin-[\w-]+$"

# 默认值配置
DEFAULT_SCORE = {
    "final": 0,
    "detail": {
        "quality": 0,
        "popularity": 0,
        "maintenance": 0
    }
}

# 全局变量存储插件数据
plugins_data = {
    "time": "",
    "total": 0,
    "version": 1,
    "objects": []
}

app = Flask(__name__)


def fetch_package_details(name, result, max_retries=MAX_RETRIES):
    """获取单个包的详细信息，添加重试机制"""
    for attempt in range(max_retries):
        try:
            pkg_url = f"{NPM_REGISTRY_BASE}/{name}"
            pkg_response = requests.get(pkg_url, timeout=REQUEST_TIMEOUT)

            if pkg_response.status_code != 200:
                if attempt < max_retries - 1:
                    time.sleep(1)  # 重试前等待
                    continue
                return None

            pkg_data = pkg_response.json()
            time_info = pkg_data.get("time", {})

            # 获取最新版本
            latest_version = pkg_data.get("dist-tags", {}).get("latest")

            # 获取版本详细信息
            version_info = pkg_data.get("versions", {}).get(
                latest_version, {}) if latest_version else {}

            # 构建 publisher 信息 - 从版本信息中获取
            publisher = {
                "name": version_info.get("_npmUser", {}).get("name", ""),
                "email": version_info.get("_npmUser", {}).get("email", ""),
                "username": version_info.get("_npmUser", {}).get("name", "")
            }

            # 检查 publisher 是否为 shigma
            is_verified = publisher["name"].lower(
            ) == "shigma" or publisher["username"].lower() == "shigma"

            # 处理 maintainers 信息 - 确保格式一致性
            maintainers = []
            for maintainer in pkg_data.get("maintainers", []):
                maintainers.append({
                    "name": maintainer.get("name", ""),
                    "email": maintainer.get("email", ""),
                    "username": maintainer.get("name", "")
                })

            # 构建 shortname - 保持原始格式
            if name.startswith("@"):
                scope, pkg_name = name.split("/")
                shortname = f"{scope}/{pkg_name.replace('koishi-plugin-', '')}"
            else:
                shortname = name.replace("koishi-plugin-", "")

            # 获取 manifest 信息
            manifest = version_info.get(
                "koishi") or pkg_data.get("koishi") or {}
            if not manifest.get("description"):
                manifest["description"] = {
                    "zh": version_info.get("description", "")}

            # 确保 links.npm 使用正确的 URL 格式
            npm_link = f"{NPM_PACKAGE_URL}/package/{name}"
            if name.startswith("@"):
                npm_link = f"{NPM_PACKAGE_URL}/{name}"

            # 添加额外的 links 信息
            package_links = {
                "npm": npm_link,
                "bugs": version_info.get("bugs", {}).get("url", ""),
                "homepage": version_info.get("homepage", ""),
                "repository": (version_info.get("repository", {}).get("url", "")
                               if isinstance(version_info.get("repository"), dict)
                               else version_info.get("repository", ""))
            }

            # 规范化 contributors 格式
            contributors = []
            for contributor in version_info.get("contributors", []):
                if isinstance(contributor, str):
                    contributors.append({"name": contributor})
                else:
                    contributors.append({
                        "name": contributor.get("name", ""),
                        "email": contributor.get("email", ""),
                        "url": contributor.get("url", ""),
                        "username": contributor.get("name", "")
                    })

            return {
                "category": result.get("category", "other"),
                "shortname": shortname,
                "createdAt": time_info.get("created"),
                "updatedAt": time_info.get("modified"),
                "updated": time_info.get("modified"),  # 使用相同的时间
                "portable": result.get("portable", False),
                "verified": is_verified,
                "score": {
                    "final": 0,
                    "detail": {
                        "quality": 0,
                        "popularity": 0,
                        "maintenance": 0
                    }
                },
                "rating": result.get("rating", 0),
                "license": version_info.get("license") or pkg_data.get("license", ""),
                "package": {
                    "name": name,
                    "keywords": version_info.get("keywords", []),
                    "version": latest_version,
                    "description": version_info.get("description", ""),
                    "publisher": publisher,
                    "maintainers": maintainers,
                    "license": version_info.get("license") or pkg_data.get("license", ""),
                    "date": time_info.get(latest_version),
                    "links": package_links,
                    "contributors": contributors
                },
                "flags": {
                    "insecure": 0
                },
                "manifest": manifest,
                "publishSize": version_info.get("dist", {}).get("unpackedSize", 0),
                "installSize": version_info.get("dist", {}).get("size", 0),
                "dependents": 0,
                "downloads": {
                    "lastMonth": 0
                },
                "insecure": False,
                "ignored": False
            }
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            print(f"Error fetching {name}: {str(e)}")
            return None


def fetch_koishi_plugins():
    params = {
        "text": SEARCH_QUERY,
        "size": SEARCH_SIZE,
    }

    # 正则表达式匹配所需的包格式
    valid_package_regex = re.compile(VALID_PACKAGE_PATTERN)

    plugins = []
    total_packages = None
    from_offset = 0

    pending_packages = []

    while True:
        params["from"] = from_offset
        response = requests.get(NPM_SEARCH_URL, params=params)

        if response.status_code != 200:
            print(
                f"Failed to fetch data: {response.status_code} - {response.text}")
            break

        data = response.json()
        if total_packages is None:
            total_packages = data.get("total", 0)

        results = data.get("objects", [])
        if not results:
            break

        # 收集合条件的包
        for result in results:
            package = result.get("package", {})
            name = package.get("name")

            if valid_package_regex.match(name):
                pending_packages.append((name, result))

        from_offset += len(results)
        print(f"Collected {from_offset}/{total_packages} packages...")

        if from_offset >= total_packages:
            break

    # 使用线程池并行处理包的详细信息获
    print("Fetching detailed information for packages...")
    # 计算最佳线程数CPU 核心数 * 5，但不超过待处理包的数量
    optimal_workers = min(
        len(pending_packages),
        multiprocessing.cpu_count() * OPTIMAL_WORKERS_MULTIPLIER
    )
    print(f"Using {optimal_workers} workers for parallel processing...")

    with ThreadPoolExecutor(max_workers=optimal_workers) as executor:
        future_to_package = {
            executor.submit(fetch_package_details, name, result): name
            for name, result in pending_packages
        }

        for future in as_completed(future_to_package):
            package_name = future_to_package[future]
            try:
                plugin_info = future.result()
                if plugin_info:
                    plugins.append(plugin_info)
                    print(f"Fetched details for {package_name}")
            except Exception as e:
                print(f"Error fetching details for {package_name}: {str(e)}")

    return plugins


def save_to_file(data, filename="index.json"):
    """保存数据到文件，确保元数据在开头"""
    output = {
        # 确保这些字段按顺序排在最前面
        "time": datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT"),
        "total": len(data),
        "version": 1,
        "objects": data
    }

    # 使用 ensure_ascii=False 支持中文，indent=2 保持格式美观
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2,
                  sort_keys=False)  # 添加 sort_keys=False 确保不会重新排序键


def update_plugins_data():
    """更新插件数据"""
    global plugins_data
    print("开始更新插件数据...")
    plugins = fetch_koishi_plugins()
    if plugins:
        # 添加详细的日志记录
        print("正在更新 plugins_data...")
        plugins_data = {
            "time": datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT"),
            "total": len(plugins),
            "version": 1,
            "objects": plugins
        }
        print(f"plugins_data 结构: {list(plugins_data.keys())}")

        print("正在保存到文件...")
        save_to_file(plugins)
        print(f"数据更新完成，共 {len(plugins)} 个插件")


@app.route('/index.json', methods=['GET'])
def get_plugins():
    """API端点：获取插件数据"""
    # 添加调试日志
    print(f"正在返回 plugins_data，数据结构: {list(plugins_data.keys())}")
    print(f"数据总量: {plugins_data.get('total')}")
    return jsonify(plugins_data)


def start_server(host=SERVER_HOST, port=SERVER_PORT):
    """启动服务器并设置定时更新"""
    # 首次更新数据
    update_plugins_data()

    # 创建后台调度器
    scheduler = BackgroundScheduler()
    # 添加任务，使用 cron 触发器
    scheduler.add_job(
        update_plugins_data,
        CronTrigger.from_crontab(SCAN_CRON),
        id='update_plugins',
        name='Update Koishi plugins data'
    )

    # 启动调度器
    scheduler.start()
    print(f"调度器已启动，扫描计划: {SCAN_CRON}")

    # 启动 Flask 服务器
    print(f"服务器启动在 http://{host}:{port}")
    app.run(host=host, port=port)


def main():
    start_server(port=SERVER_PORT)


if __name__ == "__main__":
    main()
