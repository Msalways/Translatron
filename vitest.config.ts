import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30_000,
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
            // Ratchet against the current full source set (2026-09-27):
            // 76.95 lines / 66.32 branches / 76.48 functions.
            // Raise as provider and legacy paths gain key-free coverage.
            thresholds: {
                lines: 65,
                statements: 65,
                branches: 65,
                functions: 72,
            },
        },
    },
});
