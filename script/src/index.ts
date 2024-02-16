import * as fs from "node:fs";
import * as path from "node:path";
import * as cp from "child_process";
import { GitHubRepoTags } from "./githubApi";
import { WhirlBucket, WhirlPkgJson } from "./whirlPackage";

// check ./bucket dir
const githubUrl = "https://github.com/";
const githubApiUrl = "https://api.github.com/repos/";

if (!fs.existsSync(path.resolve("../bucket/")))
    fs.mkdirSync(path.resolve("../bucket/"));

const whirlPackageList: any = require(path.resolve("../packages.json"));

const fetchOption: RequestInit = {
    method: "GET",
    headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Whirlpkg-Index"
    }
};

let commitDetails = "";

(async () => {
    for (let file in whirlPackageList) {
        let isNew = true;
        let packageInf: WhirlBucket = {
            name: file,
            repo: whirlPackageList[file],
            versions: []
        };
        const currentVersions: { [key: string]: boolean } = {};
        if (fs.existsSync(`../bucket/${file}.json`)) {
            isNew = false;
            packageInf = JSON.parse(fs.readFileSync(`../bucket/${file}.json`, { encoding: "utf-8" }));
            for (const version of packageInf.versions) {
                currentVersions[version.version] = version.status == "deprecated";
            }
        }
        const whirlPackName: string = file;
        const whirlPackageRepoURL: string = whirlPackageList[file];
        const whirlPackageGithubPath: string = whirlPackageRepoURL.split(githubUrl)[1];

        const oldVersionList = packageInf.versions;
        packageInf.versions = [];

        const messageHead = `${whirlPackName}${isNew ? " (new!)" : ""}:`;
        try {
            const tagsReq = await (await fetch(`${githubApiUrl}${whirlPackageGithubPath}/git/refs/tags/`, fetchOption)).json() as GitHubRepoTags;

            const tags: { version: string, sha: string }[] = [];
            for (const tagsReqElement of tagsReq) {
                tags.push({ version: tagsReqElement.ref.split("refs/tags/")[1], sha: tagsReqElement.object.sha });
            }

            const tasks: {
                newVersion: { version: string, sha: string }[],
                deprecateVersion: string[]
            } = {
                newVersion: [],
                deprecateVersion: []
            };

            for (const tag of tags) {
                if (currentVersions[tag.version] != undefined) {
                    currentVersions[tag.version] = true;
                    continue;
                }

                tasks.newVersion.push(tag);
            }

            for (const version in currentVersions) {
                if (currentVersions[version]) {
                    continue;
                }
                tasks.deprecateVersion.push(version);
            }

            if (tasks.newVersion.length == 0 && tasks.deprecateVersion.length == 0) {
                continue;
            }

            for (const tag of tasks.newVersion) {
                let whirlpkg: WhirlPkgJson;
                const req = await fetch(`${githubUrl}${whirlPackageGithubPath}/raw/${tag.version}/whirlpkg.json`, fetchOption);
                try {
                    whirlpkg = await req.json() as WhirlPkgJson;
                } catch {
                    console.warn(`${messageHead} invalid whirlpkg.json at version ${tag.version}`);
                    commitDetails += `:rotating_light: ${messageHead} invalid whirlpkg.json at version ${tag.version}\n`;
                    continue;
                }

                if (!whirlpkg.name || !whirlpkg.version || !whirlpkg.author || !whirlpkg.index) {
                    console.warn(`${messageHead} invalid whirlpkg.json at version ${tag.version}`);
                    commitDetails += `:rotating_light: ${messageHead} invalid whirlpkg.json at version ${tag.version}\n`;
                    continue;
                }

                packageInf.versions.push({
                    dependencies: whirlpkg.dependencies ?? {},
                    sha: tag.sha,
                    version: tag.version
                });

                console.log(`${messageHead} add ${tag.version}`);
                commitDetails += `:sparkles: ${messageHead} add ${tag.version}\n`;
            }

            for (const oldVersionListElement of oldVersionList) {
                if (tasks.deprecateVersion.indexOf(oldVersionListElement.version) >= 0) {
                    oldVersionListElement.status = "deprecated";
                    console.log(`${messageHead} deprecated ${oldVersionListElement.version}`);
                    commitDetails += `:wastebasket: ${messageHead} deprecated ${oldVersionListElement.version}\n`;
                }
                packageInf.versions.push(oldVersionListElement);
            }

            fs.writeFileSync(
                `../bucket/${whirlPackName}.json`,
                JSON.stringify(packageInf)
            );
        } catch (e) {
            console.error(e);
            console.warn(`${messageHead} cannot fetch tags.`);
        }
    }

    if (commitDetails == "") {
        console.log("Nothing changed.");
        return;
    }

    // commit
    const commitInf = "Update packages.\n\n" + commitDetails;
    cp.execSync("git config user.name \"github-actions[bot]\"", {
        cwd: path.resolve("../")
    });
    cp.execSync(
        "git config user.email \"41898282+github-actions[bot]@users.noreply.github.com\"", {
            cwd: path.resolve("../")
        }
    );
    cp.execSync(`git remote set-url origin git@github.com:WhirlScript/WhirlPKG-index.git`, {
        cwd: path.resolve("../")
    });
    cp.execSync("git add .", {
        cwd: path.resolve("../")
    });
    cp.execSync(`git commit -m "${commitInf}"`, {
        cwd: path.resolve("../")
    });

    cp.execSync(`mkdir -p ~/.ssh/`);
    cp.execSync(`touch ~/.ssh/id_rsa.pub`);
    console.log("Gen ssh pub key");
    cp.execSync(`echo '${process.env["ssh_key"]}' > ~/.ssh/id_rsa`);
    cp.execSync(`chmod 400 ~/.ssh/id_rsa`);
    console.log("Pushing to repo...");
    cp.execSync(`git push`, {
        cwd: path.resolve("../")
    });
})();