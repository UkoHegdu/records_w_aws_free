import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import App from '../App'

describe('App', () => {
    it('exports App component', () => {
        // Basic test to ensure App component is properly exported
        expect(App).toBeDefined()
        expect(typeof App).toBe('function')
    })

    it('renders without crashing', () => {
        // Test that App component can be rendered without errors
        expect(() => render(<App />)).not.toThrow()
    })
})
