/** @format */

import fs, { StatsFs } from "node:fs";
import path from "node:path";
import cp from "child_process";

// check ./bucket dir
const githubURL = "https://github.com/";
const githubAPIURL = "https://api.github.com/repos/";

if (!fs.existsSync(path.resolve("./bucket/")))
    fs.mkdirSync(path.resolve("./bucket/"));
console.log(path.resolve("./bucket/"));

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

// check whether there is a new package or not
for (let file in wrsPackageList) {
    if (fs.existsSync(`./bucket/${file}.json`)) continue;
    status.newPac.todo += 1;
}

for (let file in wrsPackageList) {
    if (fs.existsSync(`./bucket/${file}.json`)) continue;
    console.log(`New package: ${file}`);
    const wrsPackName: string = file;
    const wrsPackageRepoURL: string = wrsPackageList[file];
    const wrsPackageGithubPath: string = wrsPackageRepoURL.split(githubURL)[1];
    let packageInf = {
        name: wrsPackName,
        repo: wrsPackageRepoURL,
        versions: [] as any[],
    };

    // request github api
    fetch(`${githubAPIURL}${wrsPackageGithubPath}/git/refs/tags/`, fetchOption)
        .then(res => res.json())
        .then(data => {
            const reqData: any = data;
            const latestVersionSha: string =
                reqData[reqData.length - 1].object.sha;

            fetch(
                `${githubURL}${wrsPackageGithubPath}/raw/${latestVersionSha}/whirlpkg.json`
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
                    // write
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

// check for update
for (let fileName of wrpBucketFileList) {
    const filePath = path.join("./bucket", fileName); // bucket/<packageName>.json

    // read wrs package inf
    const wrsPackageInfo: any = require(path.resolve(filePath));

    const wrsPackageNameInFileName: string = fileName.split(".json")[0];
    const wrsPackageNameInJson: string = wrsPackageInfo.name;

    // package name check：
    if (wrsPackageNameInFileName !== wrsPackageNameInJson) continue;
    status.updatePac.todo += 1;
}

for (let fileName of wrpBucketFileList) {
    const filePath = path.join("./bucket", fileName); // bucket/<packageName>.json

    // read wrs package inf
    const wrsPackageInfo: any = require(path.resolve(filePath));

    const wrsPackageNameInFileName: string = fileName.split(".json")[0];
    const wrsPackageNameInJson: string = wrsPackageInfo.name;

    // package name check：
    if (wrsPackageNameInFileName !== wrsPackageNameInJson) {
        console.warn(
            `Package name (${wrsPackageNameInFileName}) != package name defined in ${fileName}(${wrsPackageNameInJson})!`
        );
        noticeList.failed.push(
            `Package name (${wrsPackageNameInFileName}) != package name defined in ${fileName}(${wrsPackageNameInJson})!`
        );
        continue;
    }

    const wrsPackageRepoURL: string = wrsPackageInfo.repo;
    const wrsPackageGithubPath: string = wrsPackageRepoURL.split(githubURL)[1];
    const wrsPackageVersion: string =
        wrsPackageInfo.versions[wrsPackageInfo.versions.length - 1].version;
    console.log(
        `Checking update for wrs package ${wrsPackageNameInJson}(${wrsPackageVersion})...`
    );

    // fetch github api to check update。
    fetch(`${githubAPIURL}${wrsPackageGithubPath}/git/refs/tags/`, fetchOption)
        .then(res => res.json())
        .then(data => {
            const reqData: any = data;
            const latestVersionSha: string =
                reqData[reqData.length - 1].object.sha;
            const latestVersion =
                reqData[reqData.length - 1].ref.split("refs/tags/")[1];

            // if localVer == remoreVer，return.
            if (wrsPackageVersion === latestVersion) {
                console.log("Update skip。");
                status.updatePac.finished += 1;
                return;
            }
            console.log(`Updating ${wrsPackageNameInJson}...`);
            // get whirlpkg.json's raw in target repo:
            fetch(
                `${githubURL}${wrsPackageGithubPath}/raw/${latestVersionSha}/whirlpkg.json`
            )
                .then(res => res.json())
                .then(data => {
                    const reqData: any = data;

                    // change bucket/hello.json，then push
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
                        `Updated wrs package${fileName}(${wrsPackageVersion}) to version ${reqData.version}`
                    );
                    noticeList.update.push(
                        `${fileName}(${wrsPackageVersion}) ${reqData.version}`
                    );
                    status.updatePac.finished += 1;
                });
        });
}

// commit
function push2repo() {
    cp.execSync('git config user.name "github-actions[bot]"');
    cp.execSync(
        'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"'
    );
    cp.execSync("git add .");
    let commitInf = "Update packages.\n";
    for (let newPackageNotice of noticeList.new) {
        commitInf += newPackageNotice + "\n";
    }
    for (let updatePackageNotice of noticeList.update) {
        commitInf += updatePackageNotice + "\n";
    }
    for (let deprecatePackageNotice of noticeList.deprecate) {
        commitInf += deprecatePackageNotice + "\n";
    }
    commitInf += noticeList.failed.length === 0 ? "" : "WARNING!";
    for (let failedPackageNotice of noticeList.failed) {
        commitInf += failedPackageNotice + "\n";
    }
    if (commitInf === "Update packages.\n") return;
    try {
        cp.execSync(`git commit -m "${commitInf}"`);
    } catch (e) {
        console.error(e);
        return;
    }

    cp.execSync(`mkdir -p ~/.ssh/`);
    cp.execSync(`touch ~/.ssh/id_rsa.pub`);
    cp.execSync(`echo ${process.env["ssh_key"]} > ~/.ssh/id_rsa.pub`);
    console.log("Gen ssh pub key");
    console.log(process.env["ssh_key"])
    console.log("Pushing to repo...");;
    cp.execSync(`git push`);
}

const runTask = setInterval(() => {
    if (
        status.newPac.todo <= status.newPac.finished &&
        status.updatePac.todo <= status.updatePac.finished
    ) {
        push2repo();
        console.log("Task finished！");
        //console.log(status);
        clearInterval(runTask);
    }
    console.log(status);
}, 1000);
