export declare type WhirlPkgJson = {
    name: string,
    version: string,
    author: string,
    repo?: string,
    license?: string,
    index: string,
    export?: { [key: string]: string },
    dependencies?: { [key: string]: string },
}

export declare type WhirlBucket = {
    name: string,
    repo: string,
    versions: {
        version: string,
        dependencies: { [key: string]: string },
        sha: string,
        status?: "deprecated" | "preview"
    }[],
}