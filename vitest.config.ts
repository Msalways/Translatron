import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                '**/*.test.ts',
                '**/*.config.ts',
            ],
            // Ratchet: measured 67.1 lines / 81.9 branches / 73.2 functions
            // (2026-09-24, post-014/015/016/017). Raise as legacy code migrates to v3.
            thresholds: {
                lines: 65,
                statements: 65,
                branches: 80,
                functions: 72,
            },
        },
    },
});
