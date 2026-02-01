# 🚀 Release Guide

## Quick Start - Tag-Based Releases

The simplest way to create a release is by pushing a git tag. The workflow automatically handles everything!

---

## 📦 Release Commands

### Patch Release (Bug Fixes)
**1.0.0 → 1.0.1**
```bash
git tag patch
git push origin patch
```

### Minor Release (New Features)
**1.0.0 → 1.1.0**
```bash
git tag minor
git push origin minor
```

### Major Release (Breaking Changes)
**1.0.0 → 2.0.0**
```bash
git tag major
git push origin major
```

### Specific Version
```bash
git tag v1.2.3
git push origin v1.2.3
```

### Pre-release Versions
```bash
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1

git tag v2.0.0-rc.1
git push origin v2.0.0-rc.1
```

---

## ✅ What Happens Automatically

When you push a tag, the workflow will:

1. ✅ Run all tests
2. ✅ Build the project
3. ✅ Bump version in `package.json`
4. ✅ Create a git tag (e.g., `v1.0.1`)
5. ✅ Publish to npm
6. ✅ Create GitHub release with auto-generated notes
7. ✅ Clean up trigger tag (for `patch`/`minor`/`major`)

---

## 🔧 One-Time Setup

### Add NPM Token to GitHub Secrets

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click **Generate New Token** → **Automation**
3. Copy the token
4. Go to your GitHub repository
5. Navigate to: **Settings** → **Secrets and variables** → **Actions**
6. Click **New repository secret**
7. Name: `NPM_TOKEN`
8. Paste the token
9. Click **Add secret**

**That's it!** GitHub automatically provides `GITHUB_TOKEN` for all other operations.

---

## 📋 Complete Release Workflow Example

```bash
# 1. Make your changes
git add .
git commit -m "fix: resolve translation caching issue"
git push origin main

# 2. Run tests locally (optional but recommended)
npm test
npm run build

# 3. Create a release
git tag patch
git push origin patch

# 4. Monitor the release (optional)
gh run watch

# 5. Verify on npm (after ~1-2 minutes)
npm view translatronx version
```

---

## 🎯 When to Use Each Version Type

| Type | Use For | Examples |
|------|---------|----------|
| **patch** | Bug fixes, small improvements | Fix caching, update docs, performance tweaks |
| **minor** | New features (backward compatible) | Add new provider, new CLI command, new config option |
| **major** | Breaking changes | Change API, remove features, restructure config |

---

## 🛠️ Advanced Usage

### Check Current Version
```bash
npm view translatronx version
```

### Delete a Tag (If Needed)
```bash
# Delete local tag
git tag -d patch

# Delete remote tag
git push origin :refs/tags/patch

# Or both at once
git tag -d v1.0.0 && git push origin :refs/tags/v1.0.0
```

### Monitor Release Progress
```bash
# Using GitHub CLI
gh run watch

# Or check on GitHub
# Go to: Actions tab → Release workflow
```

### View Release History
```bash
# List all tags
git tag -l

# View release on GitHub
gh release list

# View on npm
npm view translatronx versions
```

---

## 🐛 Troubleshooting

### "Tag already exists"
```bash
git tag -d patch
git push origin :refs/tags/patch
git tag patch
git push origin patch
```

### "Workflow not triggering"
- Verify tag format: `patch`, `minor`, `major`, or `v*.*.*`
- Check you pushed the tag: `git push origin TAG_NAME`
- View workflow runs in GitHub Actions tab

### "npm publish failed"
- Verify `NPM_TOKEN` is set in repository secrets
- Check if version already exists: `npm view translatronx versions`
- Ensure you have publish rights to the package

### "Tests failing"
```bash
# Run tests locally first
npm test
npm run build

# Fix any issues, then release
git tag patch && git push origin patch
```

### "Permission denied"
- Ensure repository has Actions enabled
- Check workflow permissions: Settings → Actions → General → Workflow permissions
- Should be set to "Read and write permissions"

---

## 📊 Quick Reference

| Command | Result | Use Case |
|---------|--------|----------|
| `git tag patch && git push origin patch` | 1.0.0 → 1.0.1 | Bug fixes |
| `git tag minor && git push origin minor` | 1.0.0 → 1.1.0 | New features |
| `git tag major && git push origin major` | 1.0.0 → 2.0.0 | Breaking changes |
| `git tag v1.2.3 && git push origin v1.2.3` | → 1.2.3 | Specific version |
| `git tag v1.0.0-beta.1 && git push origin v1.0.0-beta.1` | → 1.0.0-beta.1 | Pre-release |

---

## ✨ Best Practices

1. **Always test before releasing**
   ```bash
   npm test && npm run build
   ```

2. **Use semantic versioning**
   - Patch: Backward compatible bug fixes
   - Minor: Backward compatible new features
   - Major: Breaking changes

3. **Write clear commit messages**
   ```bash
   git commit -m "fix: resolve caching issue in compiler"
   git commit -m "feat: add support for Groq provider"
   ```

4. **Check npm before releasing**
   ```bash
   npm view translatronx version
   ```

5. **Monitor releases**
   - Check GitHub Actions for build status
   - Verify package on npm after release
   - Test installation: `npm install translatronx@latest`

---

## 🎉 Example Release Session

```bash
# Scenario: Fixed a bug and want to release

# 1. Commit your fix
git add .
git commit -m "fix: resolve translation cache invalidation"
git push origin main

# 2. Test locally
npm test
# ✅ All tests pass

# 3. Create patch release
git tag patch
git push origin patch

# 4. Wait ~2 minutes and verify
npm view translatronx version
# ✅ Shows new version!

# 5. Test the published package
npm install translatronx@latest
# ✅ Works perfectly!
```

---

## 📞 Need Help?

- **Workflow logs**: GitHub → Actions tab → Latest run
- **npm package**: https://www.npmjs.com/package/translatronx
- **Releases**: GitHub → Releases section
- **Issues**: Create an issue in the repository
