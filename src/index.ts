/** @format */

import fs, { StatsFs } from "node:fs";
import path from "node:path";
import cp from "child_process";

const githubURL = "https://github.com/";
const githubAPIURL = "https://api.github.com/repos/";

const wrsPackageList: any = require(path.resolve("./packages.json"));
const wrpBucketFileList: string[] = fs.readdirSync("./bucket/");

const fetchOption: RequestInit = {
    method: "GET",
    headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Whirlpkg-Index",
    },
};

console.log(wrsPackageList);

let status: any = {
    newPac: {
        todo: 0,
        finished: 0,
    },
    updatePac: {
        todo: 0,
        finished: 0,
    },
};

let noticeList: any = {
    update: [],
    new: [],
    deprecate: [],
    failed: [],
};

// 新包检测。
for (let file in wrsPackageList) {
    if (fs.existsSync(`./bucket/${file}.json`)) continue;
    status.newPac.todo += 1;
}

for (let file in wrsPackageList) {
    if (fs.existsSync(`./bucket/${file}.json`)) continue;
    console.log(`新包: ${file}`);
    const wrsPackName: string = file;
    const wrsPackageRepoURL: string = wrsPackageList[file];
    const wrsPackageGithubPath: string = wrsPackageRepoURL.split(githubURL)[1];
    let packageInf = {
        name: wrsPackName,
        repo: wrsPackageRepoURL,
        versions: [] as any[],
    };

    // 从api获取请求
    fetch(`${githubAPIURL}${wrsPackageGithubPath}/git/refs/tags/`, fetchOption)
        .then(res => res.json())
        .then(data => {
            const reqData: any = data;
            const latestVersionSha: string =
                reqData[reqData.length - 1].object.sha;

            fetch(
                `${githubURL}${wrsPackageGithubPath}/raw/${latestVersionSha}/whirlpool.json`
            )
                .then(res => res.json())
                .then(data => {
                    const reqData: any = data;

                    packageInf.versions.push({
                        version: reqData.version,
                        dependencies: reqData.dependencies
                            ? reqData.dependencies
                            : {},
                        sha1: latestVersionSha,
                    });
                    // 写入包
                    fs.writeFileSync(
                        `./bucket/${wrsPackName}.json`,
                        JSON.stringify(packageInf)
                    );
                    noticeList.new.push(
                        `${wrsPackName}(new!) ${reqData.version}`
                    );
                    status.newPac.finished += 1;
                });
        });
}

// 检查更新。
for (let fileName of wrpBucketFileList) {
    const filePath = path.join("./bucket", fileName); // bucket/<packageName>.json

    // 读取wrs包信息。
    const wrsPackageInfo: any = require(path.resolve(filePath));

    const wrsPackageNameInFileName: string = fileName.split(".json")[0];
    const wrsPackageNameInJson: string = wrsPackageInfo.name;

    // 判断文件上的包名与内部标记的包名是否一致：
    if (wrsPackageNameInFileName !== wrsPackageNameInJson) continue;
    status.updatePac.todo += 1;
}

for (let fileName of wrpBucketFileList) {
    const filePath = path.join("./bucket", fileName); // bucket/<packageName>.json

    // 读取wrs包信息。
    const wrsPackageInfo: any = require(path.resolve(filePath));

    const wrsPackageNameInFileName: string = fileName.split(".json")[0];
    const wrsPackageNameInJson: string = wrsPackageInfo.name;

    // 判断文件上的包名与内部标记的包名是否一致：
    if (wrsPackageNameInFileName !== wrsPackageNameInJson) {
        console.warn(
            `储存时文件(${fileName})的包名(${wrsPackageNameInFileName})与内部储存的包名(${wrsPackageNameInJson})不一致！
请手动干预。阿巴阿巴。`
        );
        noticeList.failed
            .push(`储存时文件(${fileName})的包名(${wrsPackageNameInFileName})与内部储存的包名(${wrsPackageNameInJson})不一致！
        请手动干预。`);
        continue;
    }

    const wrsPackageRepoURL: string = wrsPackageInfo.repo;
    const wrsPackageGithubPath: string = wrsPackageRepoURL.split(githubURL)[1];
    const wrsPackageVersion: string =
        wrsPackageInfo.versions[wrsPackageInfo.versions.length - 1].version;
    console.log(`检测更新「${wrsPackageNameInJson}」(${wrsPackageVersion})...`);
    const requestOption: any = {
        hostname: "api.github.com",
        path: `/repos/${wrsPackageGithubPath}/git/refs/tags/`,
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Whirlpkg-Index",
        },
    };

    // 请求设置

    // 从github api请求以检查更新。
    fetch(`${githubAPIURL}${wrsPackageGithubPath}/git/refs/tags/`, fetchOption)
        .then(res => res.json())
        .then(data => {
            const reqData: any = data;
            const latestVersionSha: string =
                reqData[reqData.length - 1].object.sha;
            const latestVersion =
                reqData[reqData.length - 1].ref.split("refs/tags/")[1];

            // 如果版本号相同，那么不需要继续处理了，直接返回即可。
            if (wrsPackageVersion === latestVersion) {
                console.log("无需更新。");
                status.updatePac.finished += 1;
                return;
            }
            console.log(`正在更新「${wrsPackageNameInJson}」...`);
            // 获取目标仓库中whirlpool.json的raw:
            fetch(
                `${githubURL}${wrsPackageGithubPath}/raw/${latestVersionSha}/whirlpool.json`
            )
                .then(res => res.json())
                .then(data => {
                    const reqData: any = data;

                    // 修改bucket/hello.json，并push
                    let writeData: any = require(path.resolve(filePath));
                    writeData.versions.push({
                        version: reqData.version,
                        dependencies: reqData.dependencies
                            ? reqData.dependencies
                            : {},
                        sha1: latestVersionSha,
                    });

                    fs.writeFileSync(filePath, JSON.stringify(writeData));
                    console.log(
                        `已更新${fileName}(${wrsPackageVersion})为版本${reqData.version}`
                    );
                    noticeList.update.push(
                        `${fileName}(${wrsPackageVersion}) ${reqData.version}`
                    );
                    status.updatePac.finished += 1;
                });
        });
}

// 提交
function push2repo() {
    console.log("正在push...");
    cp.execSync(
        'git config user.name "github-actions[bot]"'
    );
    console.log("设置git用户名");
    cp.execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
    console.log("设置git邮箱");
    cp.execSync("git add .");
    console.log("git添加./到暂存区");
    let commitInf = "Update packages.";
    for (let newPackageNotice in noticeList.new) {
        commitInf += newPackageNotice + "\n";
    }
    for (let updatePackageNotice in noticeList.update) {
        commitInf += updatePackageNotice + "\n";
    }
    for (let deprecatePackageNotice in noticeList.deprecate) {
        commitInf += deprecatePackageNotice + "\n";
    }
    // console.log(noticeList.failed);
    commitInf += noticeList.failed.length === 0 ? "WARNING!" : "";
    for (let failedPackageNotice in noticeList.failed) {
        commitInf += failedPackageNotice + "\n";
    }
    cp.execSync(`git commit -m "${commitInf}"`);
    console.log("git提交更改");
    console.log(commitInf);
    cp.execSync(`touch ~/.ssh/id_rsa.pub`);
    cp.execSync(`echo ${process.env["ssh_key"]} > /home/$(whoami)/.ssh/id_rsa.pub`);
    console.log("写入ssh pub key");
    console.log(process.env["ssh_key"]);
    cp.execSync(`git push`);
    console.log("git推送更改...");
}

const runTask = setInterval(() => {
    if (
        status.newPac.todo <= status.newPac.finished &&
        status.updatePac.todo <= status.updatePac.finished
    ) {
        push2repo();
        console.log("任务完成！");
        console.log(status);
        clearInterval(runTask);
    }
    console.log(status);
}, 1000);
