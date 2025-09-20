import { afterEach } from 'vitest'

// Cleanup after each test case
afterEach(() => {
    // Basic cleanup - clear any DOM modifications
    document.body.innerHTML = ''
})
