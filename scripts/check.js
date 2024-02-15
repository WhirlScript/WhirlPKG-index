#!/bin/env node
"use strict";

const fs = require('fs');
const axios = require('axios');
var path  = require('path')

const defaultInf = {
    name: null,
    repo: null,
    versions: [
        {
            version: null,
            dependencies: {},
            sha1: null
        }
    ]
}


// 这个函数如果成功返回一个Object，不成功返回null

module.exports = async function write2bucket(packName, fileName) {
    let packagesInf = JSON.parse(JSON.stringify(defaultInf));  // 将JSON拷贝
    const packages = JSON.parse(fs.readFileSync('../packages.json').toString());
    const url = packages[packName];

    const re = new RegExp(`https://github.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+`);
    if (!re.test(url)) {
        return;
    }
    const repoPath = url.split(`https://github.com/`)[1];
    const filePath = `../bucket/${packName}.json`;
    let hasNewVersion = null;

    console.log('获取githubAPI')
    console.log(`https://api.github.com/repos/${repoPath}`)
    // 获取最新tag的提交
    console.log('api获取...');
    const apiRes = (await axios.get(`https://api.github.com/repos/${repoPath}/git/refs/tags`)).data;
    console.log('api获取完毕');
    const sha = apiRes[apiRes.length - 1].object.sha;
    const currentVersion = apiRes[apiRes.length - 1].ref.split('refs/tags/')[1];
    const version = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath)).versions[0].version : null;
    // 比对tags查看有无新版本
    console.log(`${currentVersion} => ${version}`)
    if (!/[0-9]+\.[0-9]+\.[0-9]+/.test(currentVersion)) {
        return null;
    }
    if (version && currentVersion !== version) {
        console.log('有新版本！');
        hasNewVersion = true;
    } else if (!version) {
        console.log('新的包！')
        hasNewVersion = false
    } else {
        console.log('无新版本')
        process.exit(0);
        return null;
    }

    console.log('raw获取...');
    const rawRes = (await axios.get(`https://github.com/${repoPath}/raw/${sha}/whirlpool.json`)).data;
    console.log('raw获取完毕');

    let data = {
        repo: url,
        version: rawRes.version,
        sha: sha,
    }
    //console.log(rawRes);
    if (rawRes.name !== packName) {
        console.debug('名字不一致，退出');
        console.debug(rawRes.name + '   ' + packName)
        return null;
    }

    if (hasNewVersion) {
        let newVersionInf = {
            version: data.version,
            dependencies: {},
            sha1: data.sha
        }
        tmpPackInf = fs.existsSync(filePath);
        tmpPackInf.versions.unshift(newVersionInf);
        console.log(tmpPackInf)
        fs.writeFileSync(`../bucket/${fileName}`, JSON.stringify(tmpPackInf));
    } else {
        packagesInf.name = packName;
        packagesInf.repo = data.repo;
        packagesInf.versions[0].version = data.version;
        packagesInf.versions[0].sha1 = data.sha;
    
        console.log(`${data.version} ${data.sha}`)
        // 写入文件
        console.debug(path.resolve(fileName));
        fs.writeFileSync(fileName, JSON.stringify(packagesInf));
    }
}
