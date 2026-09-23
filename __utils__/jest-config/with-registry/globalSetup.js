const getPort = require('get-port')
const { promisify } = require('util')
const kill = promisify(require('tree-kill'))

module.exports = async () => {
  if (!process.env.PNPM_REGISTRY_MOCK_PORT) {
    process.env.PNPM_REGISTRY_MOCK_PORT = (await getPort({ port: getPort.makeRange(7700, 7800) })).toString()
  }
  const { start, prepare } = require('@pnpm/registry-mock')
  prepare()
  const server = start({
    // Verdaccio stopped working properly on Node.js 22.
    // You can test the issue by running:
    //   pnpm --filter=core run test test/install/auth.ts
    useNodeVersion: '20.16.0',
    stdio: 'inherit',
    // Listen on all interfaces, IPv4 and IPv6. On Windows `localhost` resolves
    // to ::1, while a bare port makes verdaccio listen on IPv4 only, which
    // results in `connect ECONNREFUSED ::1:<port>`.
    listen: `[::]:${process.env.PNPM_REGISTRY_MOCK_PORT}`,
  })
  let killed = false
  server.on('error', (err) => {
    console.log(err)
  })
  server.on('close', () => {
    if (!killed) {
      console.log('Error: The registry server was killed!')
      process.exit(1)
    }
  })
  global.killServer = () => {
    killed = true
    return kill(server.pid)
  }
  // Wait until the registry accepts connections on both 127.0.0.1 and ::1,
  // so tests do not race the server startup on either address family.
  const net = require('net')
  const port = Number(process.env.PNPM_REGISTRY_MOCK_PORT)
  const canConnect = (host) => new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const done = (ok) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(1000, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
  const deadline = Date.now() + 120_000
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const ready = await Promise.all([canConnect('127.0.0.1'), canConnect('::1')])
    if (ready.every(Boolean)) break
    if (Date.now() > deadline) {
      throw new Error(`The registry mock did not start listening on 127.0.0.1:${port} and [::1]:${port} within 120s`)
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
