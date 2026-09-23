import path from 'path'
import { preparePackage } from '@pnpm/prepare-package'
import { tempDir } from '@pnpm/prepare'
import { createTestIpcServer } from '@pnpm/test-ipc-server'
import { fixtures } from '@pnpm/test-fixtures'

const f = fixtures(__dirname)
const allowBuild = () => true

test('prepare package runs the prepublish script', async () => {
  const tmp = tempDir()
  await using server = await createTestIpcServer(path.join(tmp, 'test.sock'))
  f.copy('has-prepublish-script', tmp)
  await preparePackage({ allowBuild, rawConfig: {} }, tmp, '')
  expect(server.getLines()).toStrictEqual([
    'prepublish',
  ])
})

test('prepare package does not run the prepublish script if the main file is present', async () => {
  const tmp = tempDir()
  await using server = await createTestIpcServer(path.join(tmp, 'test.sock'))
  f.copy('has-prepublish-script-and-main-file', tmp)
  await preparePackage({ allowBuild, rawConfig: {} }, tmp, '')
  expect(server.getLines()).toStrictEqual([
    'prepublish',
  ])
})

test('prepare package runs the prepublish script in the sub folder if pkgDir is present', async () => {
  const tmp = tempDir()
  await using server = await createTestIpcServer(path.join(tmp, 'test.sock'))
  f.copy('has-prepublish-script-in-workspace', tmp)
  await preparePackage({ allowBuild, rawConfig: {} }, tmp, 'packages/foo')
  expect(server.getLines()).toStrictEqual([
    'prepublish',
  ])
})

test('prepare package does not run the build scripts if no allowBuild function is passed', async () => {
  const tmp = tempDir()
  await using server = await createTestIpcServer(path.join(tmp, 'test.sock'))
  f.copy('has-prepublish-script', tmp)
  await expect(preparePackage({ rawConfig: {} }, tmp, '')).rejects.toMatchObject({
    code: 'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED',
    message: 'The git-hosted package "has-prepublish-script@1.0.0" needs to execute build scripts but is not in the "onlyBuiltDependencies" allowlist.',
  })
  expect(server.getLines()).toStrictEqual([])
})

test('prepare package does not run the build scripts if the package is not allowed to be built', async () => {
  const tmp = tempDir()
  await using server = await createTestIpcServer(path.join(tmp, 'test.sock'))
  f.copy('has-prepublish-script', tmp)
  const allowBuildCalls: Array<[string, string]> = []
  await expect(preparePackage({
    allowBuild: (pkgName, pkgVersion) => {
      allowBuildCalls.push([pkgName, pkgVersion])
      return pkgName === 'some-other-package'
    },
    rawConfig: {},
  }, tmp, '')).rejects.toMatchObject({
    code: 'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED',
  })
  expect(allowBuildCalls).toStrictEqual([['has-prepublish-script', '1.0.0']])
  expect(server.getLines()).toStrictEqual([])
})

test('prepare package does not fail if the package is not allowed to be built but scripts are ignored', async () => {
  const tmp = tempDir()
  await using server = await createTestIpcServer(path.join(tmp, 'test.sock'))
  f.copy('has-prepublish-script', tmp)
  const result = await preparePackage({ allowBuild: () => false, ignoreScripts: true, rawConfig: {} }, tmp, '')
  expect(result.shouldBeBuilt).toBe(true)
  expect(server.getLines()).toStrictEqual([])
})
