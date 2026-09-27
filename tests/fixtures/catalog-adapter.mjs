import { writeFile } from 'node:fs/promises';

export default {
    async discover(patterns) {
        return Array.isArray(patterns) ? patterns : [patterns];
    },
    async read(files, { locale }) {
        return files.map((sourceFile) => ({
            locale,
            sourceFile,
            units: [{
                unitId: 'custom-unit',
                keyPath: 'message',
                sourceText: 'Hello',
                sourceHash: 'source-hash',
                placeholders: [],
                sourceFile,
                schemaVersion: 1,
            }],
        }));
    },
    async write(filePath, translations) {
        await writeFile(filePath, JSON.stringify(translations));
    },
};
