const { chromium } = require('playwright')
const { spawn } = require('child_process')

async function checkServerHealthy(url, maxWait = 5000) {
    // Try an actual HTTP request that we know will respond fast
    const start = Date.now()
    while (Date.now() - start < maxWait) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
            if (response.status >= 100) return true
        } catch (e) {
            // ignore
        }
        await new Promise(r => setTimeout(r, 500))
    }
    return false
}

;(async () => {
    let server = null

    // Try to connect to existing server first using fetch (more reliable than http.get)
    console.log('Checking if server is already running...')
    const alreadyRunning = await checkServerHealthy('http://localhost:3000/api/auth/csrf', 4000)

    if (!alreadyRunning) {
        console.log('Starting Next.js dev server...')
        server = spawn('npm', ['run', 'dev', '--', '--port', '3000'], {
            cwd: '/home/rimefara/projects/life_tracker/frontend',
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        server.stdout.on('data', (d) => {
            const s = d.toString()
            if (s.includes('Ready') || s.includes('✓')) {
                process.stdout.write('[server] ' + s)
            }
        })
        server.stderr.on('data', () => {})

        console.log('Waiting for server to be ready (up to 50s)...')
        const ready = await checkServerHealthy('http://localhost:3000/api/auth/csrf', 50000)
        if (!ready) {
            console.error('Server did not start in time')
            server.kill()
            process.exit(1)
        }
        console.log('Server is ready!')
    } else {
        console.log('Server already running on port 3000')
    }

    // Wait a moment for compilation to settle
    await new Promise(r => setTimeout(r, 1000))

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
    })

    const mockAnalyticsData = {
        overall_accuracy: 43,
        total_attempts: 28,
        avg_usage_score: 62,
        accuracy_trend: [
            { date: '2026-06-11', accuracy: 40, correct: 8, attempts: 20 },
            { date: '2026-06-12', accuracy: 45, correct: 9, attempts: 20 },
            { date: '2026-06-13', accuracy: 38, correct: 7, attempts: 18 },
            { date: '2026-06-14', accuracy: 50, correct: 10, attempts: 20 },
            { date: '2026-06-15', accuracy: 42, correct: 8, attempts: 19 },
            { date: '2026-06-16', accuracy: 44, correct: 9, attempts: 20 },
            { date: '2026-06-17', accuracy: 44, correct: 8, attempts: 18 },
        ],
        grammar_weak_areas: [
            { type: 'articles', label: 'Articles', count: 5 },
            { type: 'prepositions', label: 'Prepositions', count: 3 },
            { type: 'tense_consistency', label: 'Tense consistency', count: 2 },
        ],
        exercise_type_stats: [
            { type: 'meaning_mc', accuracy: 55, attempts: 8 },
            { type: 'cloze', accuracy: 40, attempts: 7 },
            { type: 'sentence', accuracy: 35, attempts: 6 },
            { type: 'spelling', accuracy: 43, attempts: 7 },
        ],
    }

    const mockGrammarQueue = {
        drill_queue: [
            { grammar_point_id: 'articles', mastery: 0.3, lapses: 4 },
            { grammar_point_id: 'conditionals', mastery: 0.5, lapses: 2 },
        ]
    }

    // Set a fake auth cookie so the middleware lets us through
    await context.addCookies([
        {
            name: 'auth-token',
            value: 'fake-token-for-testing',
            domain: 'localhost',
            path: '/',
        },
    ])

    const page = await context.newPage()

    // Use a single catch-all route handler
    await page.route('**', async (route) => {
        const url = route.request().url()

        // Handle NextAuth session - return authenticated session
        if (url.includes('/api/auth/session')) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    user: { name: 'Test User', email: 'rimefara22@gmail.com', id: '1' },
                    expires: '2027-01-01T00:00:00.000Z',
                }),
            })
        }

        // Handle NextAuth install-cookies - return success so no redirect to /auth
        if (url.includes('/api/auth/install-cookies')) {
            console.log('Mock: install-cookies')
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true }),
            })
        }

        // Handle analytics
        if (url.includes('/exercises/analytics')) {
            console.log('Mock: analytics ->', url)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockAnalyticsData),
            })
        }

        // Handle grammar drill queue
        if (url.includes('/grammar/drill-queue') || url.includes('grammar-drill-queue')) {
            console.log('Mock: grammar drill queue ->', url)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockGrammarQueue),
            })
        }

        // Handle auth/me (backend endpoint)
        if (url.includes('/auth/me')) {
            console.log('Mock: auth/me ->', url)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ id: 1, name: 'Test User', email: 'rimefara22@gmail.com' }),
            })
        }

        // Handle backend refresh token
        if (url.includes('/auth/refresh')) {
            console.log('Mock: auth/refresh ->', url)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ access_token: 'fake-access-token', token_type: 'bearer' }),
            })
        }

        // Return empty array for other backend calls (folders, etc.)
        if (url.includes('localhost:8010')) {
            console.log('Mock (empty): backend call ->', url)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            })
        }

        // Let all other requests through (Next.js, static assets, etc.)
        return route.continue()
    })

    // Navigate directly to exercises page
    const exercisesUrl = 'http://localhost:3000/platform/1/learning/exercises'
    console.log('Navigating to exercises:', exercisesUrl)

    try {
        await page.goto(exercisesUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
    } catch (e) {
        console.log('Navigation issue, continuing anyway:', e.message)
    }

    console.log('Current URL after nav:', page.url())

    // Wait for React to render
    await page.waitForTimeout(4000)
    console.log('Current URL after wait:', page.url())

    // Debug: check what text is on page
    let pageText = ''
    try {
        pageText = await page.evaluate(() => document.body.innerText)
    } catch (e) {
        console.log('Could not evaluate page text:', e.message)
    }

    const hasAccuracy = pageText.toLowerCase().includes('accuracy')
    const hasAttempts = pageText.toLowerCase().includes('attempts')
    console.log('Page has "accuracy":', hasAccuracy)
    console.log('Page has "attempts":', hasAttempts)

    if (!hasAccuracy) {
        console.log('Page content (first 400 chars):', pageText.slice(0, 400))
    }

    // Take debug screenshot
    await page.screenshot({
        path: '/home/rimefara/projects/life_tracker/frontend/debug-exercises.png',
        fullPage: true
    })
    console.log('Debug screenshot saved')

    // If we're on auth page, the mocking didn't prevent redirect -
    // Let's try a different approach: inject data directly via React context
    if (page.url().includes('/auth')) {
        console.log('Still on auth page - checking what happened')
        const authPageText = await page.evaluate(() => document.body.innerText).catch(() => '')
        console.log('Auth page content:', authPageText.slice(0, 200))
        await browser.close()
        if (server) server.kill()
        process.exit(1)
    }

    // Find and click the analytics panel expand button
    const panelButton = page.locator('button').filter({ hasText: /accuracy/i }).first()
    const panelBtnCount = await panelButton.count()
    console.log('Panel button (has "accuracy") count:', panelBtnCount)

    if (panelBtnCount > 0) {
        console.log('Clicking the analytics panel header to expand...')
        await panelButton.click()
        await page.waitForTimeout(1500)
        console.log('Panel expanded')
    } else {
        // Try finding button by chevron in rounded panel
        const chevronBtn = page.locator('.rounded-2xl > button').first()
        const chevronBtnCount = await chevronBtn.count()
        console.log('Direct child button of rounded-2xl:', chevronBtnCount)
        if (chevronBtnCount > 0) {
            await chevronBtn.click()
            await page.waitForTimeout(1500)
        }
    }

    // Take the final screenshot
    const screenshotPath = '/home/rimefara/projects/life_tracker/frontend/analytics-panel-expanded.png'
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log('Final screenshot saved to:', screenshotPath)

    await browser.close()
    if (server) server.kill()
    process.exit(0)
})()
