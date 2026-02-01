export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            [
                'feat',
                'fix',
                'perf',
                'refactor',
                'test',
                'docs',
                'chore',
                'build',
                'ci',
                'style',
                'revert'
            ]
        ],
        'scope-empty': [1, 'never']
    }
}
