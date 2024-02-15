#!/bin/env node
"use strict";
const write2bucket = require('./check.js');
const fs = require('fs');
const path = require('path');

const packages = JSON.parse(fs.readFileSync('../packages.json').toString());



for (let i in packages) {
    const fileName = path.resolve(`../bucket/${i}.json`);
    // 如果这是一个新的包的话:
    write2bucket(i, fileName);
    break;
    if (!fs.existsSync(fileName)) {
        console.warn(`新的包被写入了：${i}`)
        write2bucket(i, fileName);

    }
}