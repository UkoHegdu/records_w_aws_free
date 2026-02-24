import { afterEach } from 'vitest'
import '@testing-library/jest-dom'

// Cleanup after each test case
afterEach(() => {
    // Basic cleanup - clear any DOM modifications
    document.body.innerHTML = ''
})
