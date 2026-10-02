import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Use the real toolbar popup: a tab with a fixed viewport hides sizing bugs.
const executable =
    process.env.BROWSER_BIN ||
    (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'goblin-popup-test-'))
const browser = spawn(
    executable,
    [
        `--user-data-dir=${profile}`,
        '--remote-debugging-pipe',
        '--enable-unsafe-extension-debugging',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
        '--use-mock-keychain',
        '--window-size=1280,900',
        'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
)
const closed = new Promise((resolve) => browser.once('close', resolve))
let sequence = 0
let buffer = ''
const pending = new Map()

function rejectPending(error) {
    for (const request of pending.values()) request.reject(error)
    pending.clear()
}
browser.once('error', rejectPending)
browser.once('close', () => rejectPending(new Error('Test browser closed')))
browser.stdio[3].on('error', rejectPending)
browser.stdio[4].setEncoding('utf8')
browser.stdio[4].on('data', (chunk) => {
    buffer += chunk
    let boundary
    while ((boundary = buffer.indexOf('\0')) !== -1) {
        const message = JSON.parse(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 1)
        const request = pending.get(message.id)
        if (!request) continue
        pending.delete(message.id)
        if (message.error) request.reject(new Error(message.error.message))
        else request.resolve(message.result)
    }
})

function send({ method, params = {}, sessionId }) {
    return new Promise((resolve, reject) => {
        const id = ++sequence
        const timer = setTimeout(() => {
            pending.delete(id)
            reject(new Error(`Timed out: ${method}`))
        }, 10000)
        pending.set(id, {
            resolve(value) {
                clearTimeout(timer)
                resolve(value)
            },
            reject(error) {
                clearTimeout(timer)
                reject(error)
            },
        })
        browser.stdio[3].write(
            `${JSON.stringify({ id, method, params, sessionId })}\0`,
        )
    })
}

async function waitFor(read) {
    for (let attempt = 0; attempt < 50; attempt++) {
        const value = await read()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for the native popup')
}

async function evaluate({ sessionId, expression }) {
    const response = await send({
        method: 'Runtime.evaluate',
        sessionId,
        params: { expression, awaitPromise: true, returnByValue: true },
    })
    if (response.exceptionDetails)
        throw new Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
}

try {
    const { id } = await send({
        method: 'Extensions.loadUnpacked',
        params: { path: resolve(process.env.POPUP_DIST || 'dist') },
    })
    const popupUrl = `chrome-extension://${id}/popup.html`
    const { targetId } = await send({
        method: 'Target.createTarget',
        params: { url: popupUrl },
    })
    const { sessionId: setupSession } = await send({
        method: 'Target.attachToTarget',
        params: { targetId, flatten: true },
    })
    await waitFor(() =>
        evaluate({
            sessionId: setupSession,
            expression: `document.readyState === 'complete' && !!chrome.storage`,
        }),
    )
    const seed = {
        enabled: true,
        'ytp:LXb3EKWsInQ': {
            title: 'Native popup layout test',
            channel: 'Test channel',
            duration: 305,
            t: 122,
            ft: 205,
            updatedAt: 1,
        },
    }
    await evaluate({
        sessionId: setupSession,
        expression: `chrome.storage.local.set(${JSON.stringify(seed)})`,
    })
    await evaluate({
        sessionId: setupSession,
        expression: 'chrome.action.openPopup()',
    })
    const popup = await waitFor(async () => {
        const { targetInfos } = await send({ method: 'Target.getTargets' })
        return targetInfos.find(
            (target) => target.url === popupUrl && target.targetId !== targetId,
        )
    })
    const { sessionId } = await send({
        method: 'Target.attachToTarget',
        params: { targetId: popup.targetId, flatten: true },
    })
    await waitFor(() =>
        evaluate({
            sessionId,
            expression: `document.querySelector('#list')?.getAttribute('aria-busy') === 'false'`,
        }),
    )
    const dimensions = await evaluate({
        sessionId,
        expression: `({
            width: innerWidth,
            height: innerHeight,
            mainHeight: document.querySelector('main').getBoundingClientRect().height,
            listHeight: document.querySelector('.list-scroll').getBoundingClientRect().height,
            mainBottom: document.querySelector('main').getBoundingClientRect().bottom,
            horizontalOverflow: document.body.scrollWidth > innerWidth,
            cards: document.querySelectorAll('.card').length,
            error: document.querySelector('#error').textContent,
        })`,
    })
    if (process.env.POPUP_SCREENSHOT) {
        const { data } = await send({
            method: 'Page.captureScreenshot',
            sessionId,
            params: { format: 'png', captureBeyondViewport: false },
        })
        await writeFile(
            process.env.POPUP_SCREENSHOT,
            Buffer.from(data, 'base64'),
        )
    }
    assert.equal(dimensions.width, 400, 'Native popup width collapsed')
    assert.equal(dimensions.height, 600, 'Native popup height collapsed')
    assert.ok(dimensions.mainHeight > 400, 'Video area collapsed')
    assert.ok(dimensions.listHeight > 300, 'Video list collapsed')
    assert.equal(dimensions.mainBottom, 600, 'Video area is clipped')
    assert.equal(dimensions.horizontalOverflow, false, 'Content overflows')
    assert.equal(dimensions.cards, 1, 'Saved video did not render')
    assert.equal(dimensions.error, '', 'Popup reported an error')
    console.log('Native popup layout passed:', dimensions)
} finally {
    if (browser.exitCode === null && browser.signalCode === null)
        browser.kill('SIGTERM')
    await closed
    await rm(profile, { recursive: true, force: true })
}
