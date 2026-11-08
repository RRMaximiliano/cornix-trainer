// Talk to the keyboard with the VIA protocol over WebHID (Chrome, Arc, Edge).

const FILTER: HIDDeviceFilter = { vendorId: 0xe118, productId: 0x0001, usagePage: 0xff60, usage: 0x61 }

export const webHidSupported = () => typeof navigator !== 'undefined' && 'hid' in navigator

let device: HIDDevice | null = null
let queue: Promise<unknown> = Promise.resolve()
const listeners = new Set<(connected: boolean) => void>()

export const isConnected = () => !!device?.opened
export function onConnectionChange(fn: (connected: boolean) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const notify = () => listeners.forEach((fn) => fn(isConnected()))

function pick(devs: HIDDevice[]) {
  return devs.find((d) => d.vendorId === FILTER.vendorId && d.collections.some((c) => c.usagePage === 0xff60))
}

/** Open the keyboard. With prompt=false only reuses a device the browser already has permission for. */
export async function connect(prompt: boolean): Promise<boolean> {
  if (!webHidSupported()) return false
  if (device?.opened) return true
  let dev = pick(await navigator.hid.getDevices())
  if (!dev && prompt) dev = pick(await navigator.hid.requestDevice({ filters: [FILTER] }))
  if (!dev) return false
  if (!dev.opened) await dev.open()
  device = dev
  navigator.hid.addEventListener('disconnect', (e) => {
    if (e.device === device) {
      device = null
      notify()
    }
  })
  notify()
  return true
}

function rawTransfer(dev: HIDDevice, data: number[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      dev.removeEventListener('inputreport', onReport)
      reject(new Error('The keyboard did not answer. Try connecting it with a USB cable.'))
    }, 2000)
    function onReport(e: HIDInputReportEvent) {
      clearTimeout(timer)
      dev.removeEventListener('inputreport', onReport)
      resolve(new Uint8Array(e.data.buffer))
    }
    dev.addEventListener('inputreport', onReport)
    const buf = new Uint8Array(32)
    buf.set(data)
    dev.sendReport(0, buf).catch(reject)
  })
}

/** Requests are queued so a matrix query never interleaves with a keymap read. */
function transfer(data: number[]): Promise<Uint8Array> {
  const dev = device
  if (!dev) return Promise.reject(new Error('Keyboard not connected.'))
  const next = queue.then(() => rawTransfer(dev, data))
  queue = next.catch(() => undefined)
  return next
}

export async function readLayers(rows: number, cols: number): Promise<number[][][]> {
  if (!(await connect(true))) throw new Error('No Cornix selected.')
  const count = (await transfer([0x11]))[1]
  const total = rows * cols * count * 2
  const bytes: number[] = []
  for (let off = 0; off < total; off += 28) {
    const n = Math.min(28, total - off)
    const r = await transfer([0x12, off >> 8, off & 0xff, n])
    bytes.push(...r.slice(4, 4 + n))
  }
  const layers: number[][][] = []
  for (let l = 0; l < count; l++) {
    layers.push(
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const i = ((l * rows + r) * cols + c) * 2
          return (bytes[i] << 8) | bytes[i + 1]
        }),
      ),
    )
  }
  return layers
}

/** Physical keys held right now, as "row,col" ids (VIA switch matrix state). */
export async function readMatrix(rows: number, cols: number): Promise<string[]> {
  const r = await transfer([0x02, 0x03])
  if (r[0] !== 0x02) return []
  const per = Math.ceil(cols / 8)
  const held: string[] = []
  for (let row = 0; row < rows; row++) {
    let bits = 0
    for (let b = 0; b < per; b++) bits = (bits << 8) | r[2 + row * per + b]
    for (let col = 0; col < cols; col++) if (bits & (1 << col)) held.push(`${row},${col}`)
  }
  return held
}
